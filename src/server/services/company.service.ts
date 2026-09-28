import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { companyKey, getStorage } from "@/lib/storage";
import { IMAGE_TYPES, MAX_LOGO_BYTES, detectImageType } from "@/lib/storage/images";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { CompanyProfileInput } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import { companyRepository } from "@/server/repositories/company.repository";
import type { DbClient } from "@/server/repositories/helpers";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { accessService } from "./access.service";
import { ledgerService } from "./ledger.service";
import { recordAuditEvent, writeAuditLog } from "./audit.service";

/** Removing an old file must not fail the user's action; a leftover file is logged for cleanup. */
async function deleteQuietly(key: string) {
  await getStorage()
    .delete(key)
    .catch((error: unknown) => logger.warn("Could not delete old stored file", { key, error }));
}

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

  /** The current company's profile. Always `ctx.companyId` — there is no way to ask for another company. */
  /** How the current company formats numbers, money and dates. Any member may read it (no settings permission). */
  async formatting(ctx: TenantContext) {
    const company = await companyRepository.findById(ctx.companyId);
    if (!company) throw new NotFoundError("Company");
    return { locale: company.locale, timeZone: company.timezone, currency: company.baseCurrency };
  },

  async getProfile(ctx: TenantContext) {
    authorize(ctx, "settings:view");
    const company = await companyRepository.findProfile(ctx.companyId);
    if (!company) throw new NotFoundError("Company");
    return company;
  },

  async updateProfile(ctx: TenantContext, input: CompanyProfileInput) {
    authorize(ctx, "settings:manage");
    const before = await this.getProfile(ctx);
    const nullable = (value: string) => value || null;
    return db.$transaction(async (tx) => {
      const after = await companyRepository.update(
        ctx.companyId,
        {
          name: input.name,
          legalName: nullable(input.legalName),
          taxId: nullable(input.taxId),
          email: nullable(input.email),
          phone: nullable(input.phone),
          address: nullable(input.address),
          country: nullable(input.country),
          baseCurrency: input.baseCurrency,
          timezone: input.timezone,
          locale: input.locale,
          fiscalYearStartMonth: input.fiscalYearStartMonth,
        },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        { action: "company.update", entityType: "Company", entityId: ctx.companyId, before, after },
        tx,
      );
      return after;
    });
  },

  /**
   * Replaces the current company's logo. The file type is detected from its bytes (PNG, JPEG or WebP; max 1 MB).
   * The file is stored under the company's own storage prefix; the old file is removed after the database commit.
   */
  async setLogo(ctx: TenantContext, bytes: Uint8Array) {
    authorize(ctx, "settings:manage");
    if (bytes.byteLength === 0) throw new ValidationError("Choose an image file.");
    if (bytes.byteLength > MAX_LOGO_BYTES) throw new ValidationError("The logo must be 1 MB or smaller.");
    const type = detectImageType(bytes);
    if (!type) throw new ValidationError("Upload a PNG, JPEG or WebP image.");

    const before = await this.getProfile(ctx);
    const key = companyKey(ctx.companyId, "logo", `${crypto.randomUUID()}.${IMAGE_TYPES[type]}`);
    const storage = getStorage();
    await storage.put(key, bytes, type);
    try {
      await db.$transaction(async (tx) => {
        await companyRepository.update(
          ctx.companyId,
          { logoKey: key, logoContentType: type, logoUpdatedAt: new Date() },
          ctx.userId,
          tx,
        );
        await writeAuditLog(
          ctx,
          {
            action: "company.logo_update",
            entityType: "Company",
            entityId: ctx.companyId,
            before: { logoKey: before.logoKey },
            after: { logoKey: key, contentType: type, bytes: bytes.byteLength },
          },
          tx,
        );
      });
    } catch (error) {
      await storage
        .delete(key)
        .catch((cleanupError: unknown) => logger.warn("Orphaned logo file", { key, cleanupError }));
      throw error;
    }
    if (before.logoKey) await deleteQuietly(before.logoKey);
  },

  async removeLogo(ctx: TenantContext) {
    authorize(ctx, "settings:manage");
    const before = await this.getProfile(ctx);
    if (!before.logoKey) return;
    await db.$transaction(async (tx) => {
      await companyRepository.update(
        ctx.companyId,
        { logoKey: null, logoContentType: null, logoUpdatedAt: new Date() },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "company.logo_remove",
          entityType: "Company",
          entityId: ctx.companyId,
          before: { logoKey: before.logoKey },
        },
        tx,
      );
    });
    await deleteQuietly(before.logoKey);
  },

  /** The current company's logo for display to any member. Never another company's: the key comes from ctx. */
  async getLogo(ctx: TenantContext): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const company = await companyRepository.findProfile(ctx.companyId);
    if (!company?.logoKey || !company.logoContentType) return null;
    const bytes = await getStorage().get(company.logoKey);
    return bytes ? { bytes, contentType: company.logoContentType } : null;
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
      await ledgerService.ensureAccounts(company.id, tx);
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
