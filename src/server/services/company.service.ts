import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { NotFoundError } from "@/lib/errors";
import { OWNER_ROLE } from "@/lib/permissions";
import type { TenantContext } from "@/lib/tenant";
import { companyRepository } from "@/server/repositories/company.repository";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { accessService } from "./access.service";
import { recordAuditEvent } from "./audit.service";

export interface BootstrapInput {
  company: { name: string; slug: string; baseCurrency?: string; timezone?: string };
  owner: { email: string; name: string; password: string };
}

export const companyService = {
  async getCurrent(ctx: TenantContext) {
    const company = await companyRepository.findById(ctx.companyId);
    if (!company) throw new NotFoundError("Company");
    return company;
  },

  /**
   * Creates a company with its built-in roles and an Owner account — or, if they already exist,
   * brings them up to date. Idempotent, so the seed can run on every deploy.
   * An existing owner's password is never changed.
   */
  async bootstrap(input: BootstrapInput) {
    const passwordHash = await hashPassword(input.owner.password);
    return db.$transaction(
      async (tx) => {
        await accessService.syncPermissionCatalog(tx);

        const existing = await companyRepository.findBySlug(input.company.slug, tx);
        const company =
          existing ??
          (await companyRepository.create(
            {
              name: input.company.name,
              slug: input.company.slug,
              ...(input.company.baseCurrency ? { baseCurrency: input.company.baseCurrency } : {}),
              ...(input.company.timezone ? { timezone: input.company.timezone } : {}),
            },
            null,
            tx,
          ));
        if (!existing) {
          await recordAuditEvent(
            {
              action: "company.create",
              entityType: "Company",
              entityId: company.id,
              companyId: company.id,
              after: company,
            },
            tx,
          );
        }

        const roleIds = await accessService.ensureDefaultRoles(company.id, null, tx);
        const ownerRoleId = roleIds[OWNER_ROLE];
        if (!ownerRoleId) throw new Error("Owner role was not created.");

        const existingOwner = await userRepository.findByEmail(input.owner.email, tx);
        const owner =
          existingOwner ??
          (await userRepository.create(
            { email: input.owner.email, name: input.owner.name, passwordHash },
            null,
            tx,
          ));
        await membershipRepository.upsert(company.id, owner.id, ownerRoleId, null, tx);
        if (!existingOwner) {
          await recordAuditEvent(
            {
              action: "user.create",
              entityType: "User",
              entityId: owner.id,
              companyId: company.id,
              after: { id: owner.id, email: owner.email, name: owner.name, role: OWNER_ROLE },
            },
            tx,
          );
        }

        return { company, ownerId: owner.id, createdCompany: !existing, createdOwner: !existingOwner };
      },
      { timeout: 30_000 },
    );
  },
};
