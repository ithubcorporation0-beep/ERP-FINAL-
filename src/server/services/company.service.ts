import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { NotFoundError } from "@/lib/errors";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import type { TenantContext } from "@/lib/tenant";
import { slugify } from "@/lib/utils";
import { companyRepository } from "@/server/repositories/company.repository";
import type { DbClient } from "@/server/repositories/helpers";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { accessService } from "./access.service";
import { recordAuditEvent } from "./audit.service";

export interface BootstrapInput {
  company: { name: string; slug: string; baseCurrency?: string; timezone?: string };
  owner: { email: string; name: string; password: string };
  /** The seed trusts its own admin address; self-registration must verify it first. */
  ownerEmailVerified?: boolean;
}

/** A slug that is not taken yet: "acme", then "acme-2", "acme-3", … */
async function availableSlug(base: string, client: DbClient): Promise<string> {
  const root = slugify(base) || "company";
  for (let attempt = 1; attempt < 50; attempt++) {
    const candidate = attempt === 1 ? root : `${root}-${attempt}`;
    if (!(await companyRepository.findBySlug(candidate, client))) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

export const companyService = {
  async getCurrent(ctx: TenantContext) {
    const company = await companyRepository.findById(ctx.companyId);
    if (!company) throw new NotFoundError("Company");
    return company;
  },

  availableSlug: (base: string, client: DbClient = db) => availableSlug(base, client),

  /**
   * Creates a company with its built-in roles and a Super Admin account — or, if they already exist,
   * brings them up to date. Idempotent, so the seed can run on every deploy. An existing user's
   * password is never changed. Pass `client` to run inside an outer transaction.
   */
  async bootstrap(input: BootstrapInput, client?: DbClient) {
    const passwordHash = await hashPassword(input.owner.password);
    const run = async (tx: DbClient) => {
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
      const superAdminRoleId = roleIds[SUPER_ADMIN_ROLE];
      if (!superAdminRoleId) throw new Error("Super Admin role was not created.");

      const existingOwner = await userRepository.findByEmail(input.owner.email, tx);
      const owner =
        existingOwner ??
        (await userRepository.create(
          {
            email: input.owner.email,
            name: input.owner.name,
            passwordHash,
            emailVerifiedAt: input.ownerEmailVerified === false ? null : new Date(),
          },
          null,
          tx,
        ));
      await membershipRepository.upsert(company.id, owner.id, superAdminRoleId, null, tx);
      if (!existingOwner) {
        await recordAuditEvent(
          {
            action: "user.create",
            entityType: "User",
            entityId: owner.id,
            companyId: company.id,
            after: { id: owner.id, email: owner.email, name: owner.name, role: SUPER_ADMIN_ROLE },
          },
          tx,
        );
      }

      return { company, ownerId: owner.id, createdCompany: !existing, createdOwner: !existingOwner };
    };
    return client ? run(client) : db.$transaction(run, { timeout: 30_000 });
  },
};
