import { memoryOutbox } from "@/lib/email";
import type { TenantContext } from "@/lib/tenant";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { roleRepository } from "@/server/repositories/role.repository";
import { authService } from "@/server/services/auth.service";
import { companyService } from "@/server/services/company.service";
import { memberService } from "@/server/services/member.service";

let counter = 0;
export const TEST_PASSWORD = "integration-test-password";

/** Creates a real company with its Super Admin via the production bootstrap, and returns their context. */
export async function createCompanyWithOwner(name = `Company ${++counter}`): Promise<TenantContext> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const { company, ownerId } = await companyService.bootstrap({
    company: { name, slug },
    owner: { email: `owner-${slug}@example.test`, name: `Owner ${name}`, password: TEST_PASSWORD },
  });
  return contextFor(ownerId, company.id);
}

export async function contextFor(userId: string, companyId: string): Promise<TenantContext> {
  const access = await membershipRepository.findAccess(userId, companyId);
  if (!access) throw new Error("No access");
  return {
    userId,
    companyId,
    roleId: access.roleId,
    roleName: access.roleName,
    permissions: access.permissions,
  };
}

/** The token from the last emailed link to `path` (e.g. "/reset-password"), as a user would click it. */
export function lastEmailedToken(path: string, to?: string): string {
  const message = [...memoryOutbox]
    .reverse()
    .find((entry) => (!to || entry.to === to) && entry.text.includes(path));
  const token = message?.text.match(/[?&]token=([A-Za-z0-9_-]{43})/)?.[1];
  if (!token) throw new Error(`No emailed link to ${path}${to ? ` for ${to}` : ""}`);
  return token;
}

/**
 * Adds a real member with the given built-in role through the production flows: the Super Admin invites them,
 * they accept the emailed invitation. Returns their context in that company.
 */
export async function addMember(
  owner: TenantContext,
  roleName: string,
  email = `${roleName.replace(/\s+/g, "-").toLowerCase()}-${++counter}@example.test`,
) {
  const role = await roleRepository.findByName(owner.companyId, roleName);
  if (!role) throw new Error(`Unknown role ${roleName}`);
  await memberService.invite(owner, { name: `${roleName} User`, email, roleId: role.id });
  const user = await authService.acceptInvitation({
    token: lastEmailedToken("/accept-invite", email),
    name: `${roleName} User`,
    password: TEST_PASSWORD,
    confirmPassword: TEST_PASSWORD,
  });
  return { ctx: await contextFor(user.id, owner.companyId), email };
}
