import type { TenantContext } from "@/lib/tenant";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { companyService } from "@/server/services/company.service";

let counter = 0;

/** Creates a real company with its Owner via the production bootstrap, and returns the Owner's context. */
export async function createCompanyWithOwner(name = `Company ${++counter}`): Promise<TenantContext> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const { company, ownerId } = await companyService.bootstrap({
    company: { name, slug },
    owner: {
      email: `owner-${slug}@example.test`,
      name: `Owner ${name}`,
      password: "integration-test-password",
    },
  });
  const access = await membershipRepository.findAccess(ownerId, company.id);
  if (!access) throw new Error("Owner has no access after bootstrap");
  return { userId: ownerId, companyId: company.id, roleId: access.roleId, permissions: access.permissions };
}
