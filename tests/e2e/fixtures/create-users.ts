/**
 * E2E fixture: users per role in the seeded company, a second company, and a user in both — all created through
 * the real flows (bootstrap, invite → emailed link → accept). Idempotent. Run by tests/e2e/global-setup.ts.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { memoryOutbox } from "@/lib/email";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import type { TenantContext } from "@/lib/tenant";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { roleRepository } from "@/server/repositories/role.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { authService } from "@/server/services/auth.service";
import { companyService } from "@/server/services/company.service";
import { memberService } from "@/server/services/member.service";
import { E2E_MULTI_USER, E2E_OTHER_COMPANY, E2E_PASSWORD, E2E_USERS } from "../users";

async function ownerContext(email: string, companyId?: string): Promise<TenantContext> {
  const owner = await userRepository.findByEmail(email);
  if (!owner) throw new Error(`${email} not found — run \`npm run db:seed\` first`);
  const access = await membershipRepository.findAccess(owner.id, companyId);
  if (!access || access.roleName !== SUPER_ADMIN_ROLE) throw new Error(`${email} is not a Super Admin`);
  return { userId: owner.id, ...access };
}

/** Adds `email` to the company with `roleName` (inviting + accepting for new people). */
async function ensureMember(ctx: TenantContext, user: { email: string; name: string }, roleName: string) {
  const existing = await userRepository.findByEmail(user.email);
  if (existing && (await membershipRepository.findByUser(ctx.companyId, existing.id))) return;
  const role = await roleRepository.findByName(ctx.companyId, roleName);
  if (!role) throw new Error(`Role ${roleName} not found`);
  await memberService.invite(ctx, { name: user.name, email: user.email, roleId: role.id });
  if (!existing) {
    const token = memoryOutbox.at(-1)?.text.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    if (!token) throw new Error("Invitation email not captured");
    await authService.acceptInvitation({
      token,
      name: user.name,
      password: E2E_PASSWORD,
      confirmPassword: E2E_PASSWORD,
    });
  }
  console.log(`e2e: ${user.email} is ${roleName}`);
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("SEED_ADMIN_EMAIL is not set");
  const companyA = await ownerContext(adminEmail);

  for (const user of Object.values(E2E_USERS)) await ensureMember(companyA, user, user.role);
  await ensureMember(companyA, E2E_MULTI_USER, "Employee");

  const { company } = await companyService.bootstrap({
    company: { name: E2E_OTHER_COMPANY.name, slug: E2E_OTHER_COMPANY.slug },
    owner: { ...E2E_OTHER_COMPANY.owner, password: E2E_PASSWORD },
  });
  const companyB = await ownerContext(E2E_OTHER_COMPANY.owner.email, company.id);
  await ensureMember(companyB, E2E_MULTI_USER, "Accountant");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
