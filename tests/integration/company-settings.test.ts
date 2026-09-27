import { describe, expect, it } from "vitest";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import { getStorage } from "@/lib/storage";
import { companyService } from "@/server/services/company.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const profile = {
  name: "Acme Trading",
  legalName: "Acme Trading LLC",
  taxId: "TRN-100",
  email: "office@acme.test",
  phone: "+971 4 000 0000",
  address: "Dubai",
  country: "AE",
  baseCurrency: "AED",
  timezone: "Asia/Dubai",
  locale: "en-AE",
  fiscalYearStartMonth: 4,
};

describe("company profile", () => {
  it("is updated by a Super Admin and audited", async () => {
    const ctx = await createCompanyWithOwner("Profile Co");
    await companyService.updateProfile(ctx, profile);
    expect(await companyService.getProfile(ctx)).toMatchObject({ ...profile, updatedAt: expect.any(Date) });
    expect(
      await rawDb.auditLog.count({ where: { companyId: ctx.companyId, action: "company.update" } }),
    ).toBe(1);
  });

  it("is read-only for an Admin (no settings:manage) and hidden from an Employee", async () => {
    const owner = await createCompanyWithOwner("Readonly Co");
    const { ctx: admin } = await addMember(owner, "Admin");
    const { ctx: employee } = await addMember(owner, "Employee");
    await expect(companyService.getProfile(admin)).resolves.toHaveProperty("name", "Readonly Co");
    await expect(companyService.updateProfile(admin, profile)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(companyService.getProfile(employee)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("company logo", () => {
  it("stores the image under the company's own prefix and replaces the old file", async () => {
    const ctx = await createCompanyWithOwner("Logo Co");
    await companyService.setLogo(ctx, PNG);
    const first = await rawDb.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    expect(first.logoKey).toMatch(new RegExp(`^companies/${ctx.companyId}/logo/[0-9a-f-]+\\.png$`));
    expect(first.logoContentType).toBe("image/png");

    await companyService.setLogo(ctx, JPEG);
    const second = await rawDb.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    expect(second.logoContentType).toBe("image/jpeg");
    expect(await getStorage().get(first.logoKey ?? "")).toBeNull();
    expect(await companyService.getLogo(ctx)).toEqual({ bytes: JPEG, contentType: "image/jpeg" });

    await companyService.removeLogo(ctx);
    expect(await companyService.getLogo(ctx)).toBeNull();
    expect(await getStorage().get(second.logoKey ?? "")).toBeNull();
  });

  it("rejects files that are not PNG/JPEG/WebP (whatever their name) and files over 1 MB", async () => {
    const ctx = await createCompanyWithOwner("Strict Logo Co");
    const svg = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    await expect(companyService.setLogo(ctx, svg)).rejects.toBeInstanceOf(ValidationError);
    await expect(companyService.setLogo(ctx, new Uint8Array(0))).rejects.toBeInstanceOf(ValidationError);
    const huge = new Uint8Array(1024 * 1024 + 1);
    huge.set(PNG);
    await expect(companyService.setLogo(ctx, huge)).rejects.toBeInstanceOf(ValidationError);
  });

  it("can only be changed with settings:manage", async () => {
    const owner = await createCompanyWithOwner("Logo Rights Co");
    const { ctx: admin } = await addMember(owner, "Admin");
    await expect(companyService.setLogo(admin, PNG)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(companyService.removeLogo(admin)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
