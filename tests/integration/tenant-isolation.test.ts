import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { customerRepository } from "@/server/repositories/customer.repository";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { notificationRepository } from "@/server/repositories/notification.repository";
import { roleRepository } from "@/server/repositories/role.repository";
import { settingRepository } from "@/server/repositories/setting.repository";
import { companyService } from "@/server/services/company.service";
import { customerService } from "@/server/services/customer.service";
import { memberService } from "@/server/services/member.service";
import { roleService } from "@/server/services/role.service";
import { settingsService } from "@/server/services/settings.service";
import { customerListQuerySchema, customerSchema } from "@/lib/validation";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const page = { page: 1, pageSize: 50 };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/** Two real companies, each with data of every tenant-owned kind. */
async function twoCompanies() {
  const a = await createCompanyWithOwner("Company A");
  const b = await createCompanyWithOwner("Company B");
  const customerOfB = await customerService.create(b, { name: "B's customer" });
  const customRoleOfB = await roleService.create(b, {
    name: "B custom",
    description: "",
    permissions: ["leads:view"],
  });
  const { ctx: memberOfB } = await addMember(b, "Employee");
  const membershipOfB = await rawDb.membership.findUniqueOrThrow({
    where: { companyId_userId: { companyId: b.companyId, userId: memberOfB.userId } },
  });
  await settingsService.set(b, "general.dateFormat", "dd/MM/yyyy");
  await rawDb.notification.create({
    data: { companyId: b.companyId, userId: b.userId, title: "For B only" },
  });
  return { a, b, customerOfB, customRoleOfB, membershipOfB };
}

describe("Company A cannot read Company B data", () => {
  it("through services", async () => {
    const { a, b, customerOfB, customRoleOfB } = await twoCompanies();

    expect((await customerService.list(a, customerListQuerySchema.parse(page))).items).toEqual([]);
    await expect(customerService.get(a, customerOfB.id)).rejects.toBeInstanceOf(NotFoundError);

    const members = await memberService.list(a, page);
    expect(members.items.map((member) => member.user.id)).toEqual([a.userId]);

    expect((await roleService.list(a)).map((role) => role.id)).not.toContain(customRoleOfB.id);
    await expect(roleService.get(a, customRoleOfB.id)).rejects.toBeInstanceOf(NotFoundError);

    expect(await settingsService.get(a, "general.dateFormat")).toBe("yyyy-MM-dd");
    expect((await companyService.getProfile(a)).id).toBe(a.companyId);
    expect((await companyService.getProfile(a)).name).toBe("Company A");

    // B really has the data (the checks above are not passing because B is empty).
    expect((await customerService.list(b, customerListQuerySchema.parse(page))).total).toBe(1);
  });

  it("through repositories, even when given B's ids", async () => {
    const { a, customerOfB, customRoleOfB, membershipOfB } = await twoCompanies();
    expect(await customerRepository.findById(a.companyId, customerOfB.id)).toBeNull();
    expect(await roleRepository.findById(a.companyId, customRoleOfB.id)).toBeNull();
    expect(await membershipRepository.findById(a.companyId, membershipOfB.id)).toBeNull();
    expect(await settingRepository.find(a.companyId, "general.dateFormat")).toBeNull();
    expect(await notificationRepository.countUnread(a.companyId, a.userId)).toBe(0);
  });

  it("including the company logo", async () => {
    const { a, b } = await twoCompanies();
    await companyService.setLogo(b, PNG);
    expect(await companyService.getLogo(a)).toBeNull();
    expect(await companyService.getLogo(b)).toMatchObject({ contentType: "image/png" });
  });
});

describe("Company A cannot update Company B data", () => {
  it("through services", async () => {
    const { a, b, customerOfB, customRoleOfB, membershipOfB } = await twoCompanies();

    await expect(customerService.update(a, customerOfB.id, { name: "Hijacked" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      roleService.update(a, customRoleOfB.id, { name: "Hijacked", description: "", permissions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(memberService.changeRole(a, membershipOfB.id, a.roleId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(memberService.setSuspended(a, membershipOfB.id, true)).rejects.toBeInstanceOf(NotFoundError);

    // A's own settings and profile changes never touch B.
    await settingsService.set(a, "general.dateFormat", "MM/dd/yyyy");
    await companyService.updateProfile(a, {
      name: "Company A renamed",
      legalName: "",
      taxId: "",
      email: "",
      phone: "",
      address: "",
      country: "",
      baseCurrency: "EUR",
      timezone: "UTC",
      locale: "en-US",
      fiscalYearStartMonth: 1,
    });
    await companyService.setLogo(a, PNG);

    expect(await rawDb.customer.findUniqueOrThrow({ where: { id: customerOfB.id } })).toMatchObject({
      name: "B's customer",
    });
    expect(await rawDb.role.findUniqueOrThrow({ where: { id: customRoleOfB.id } })).toMatchObject({
      name: "B custom",
    });
    expect(await rawDb.membership.findUniqueOrThrow({ where: { id: membershipOfB.id } })).toMatchObject({
      status: "ACTIVE",
      roleId: membershipOfB.roleId,
    });
    expect(await settingsService.get(b, "general.dateFormat")).toBe("dd/MM/yyyy");
    expect(await rawDb.company.findUniqueOrThrow({ where: { id: b.companyId } })).toMatchObject({
      name: "Company B",
      baseCurrency: "USD",
      logoKey: null,
    });
  });

  it("through repositories, even when given B's ids", async () => {
    const { a, customerOfB, customRoleOfB, membershipOfB } = await twoCompanies();
    expect(
      await customerRepository.update(a.companyId, customerOfB.id, { name: "Hijacked" }, a.userId),
    ).toBeNull();
    expect(
      await roleRepository.update(a.companyId, customRoleOfB.id, { name: "Hijacked" }, a.userId),
    ).toEqual({ count: 0 });
    expect(
      await membershipRepository.update(a.companyId, membershipOfB.id, { status: "SUSPENDED" }, a.userId),
    ).toEqual({
      count: 0,
    });
    expect(await rawDb.customer.findUniqueOrThrow({ where: { id: customerOfB.id } })).toMatchObject({
      name: "B's customer",
    });
  });

  it("cannot move a record into another company", async () => {
    const { a, b } = await twoCompanies();
    // Input schemas strip unknown keys, so a companyId smuggled into a request body never reaches the service…
    const input = customerSchema.parse({ name: "Mine", companyId: b.companyId });
    expect(input).not.toHaveProperty("companyId");
    // …and the repository always writes the caller's company anyway.
    const created = await customerService.create(a, input);
    expect(await rawDb.customer.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      companyId: a.companyId,
    });
  });
});

describe("Company A cannot delete Company B data", () => {
  it("through services", async () => {
    const { a, customerOfB, customRoleOfB, membershipOfB } = await twoCompanies();
    await expect(customerService.remove(a, customerOfB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(roleService.remove(a, customRoleOfB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(memberService.remove(a, membershipOfB.id)).rejects.toBeInstanceOf(NotFoundError);

    expect(await rawDb.customer.findUniqueOrThrow({ where: { id: customerOfB.id } })).toMatchObject({
      deletedAt: null,
    });
    expect(await rawDb.role.count({ where: { id: customRoleOfB.id } })).toBe(1);
    expect(await rawDb.membership.count({ where: { id: membershipOfB.id } })).toBe(1);
  });

  it("through repositories, even when given B's ids", async () => {
    const { a, customerOfB, customRoleOfB, membershipOfB } = await twoCompanies();
    expect(await customerRepository.softDelete(a.companyId, customerOfB.id, a.userId)).toEqual({ count: 0 });
    expect(await roleRepository.delete(a.companyId, customRoleOfB.id)).toEqual({ count: 0 });
    expect(await membershipRepository.delete(a.companyId, membershipOfB.id)).toEqual({ count: 0 });
    expect(await rawDb.customer.findUniqueOrThrow({ where: { id: customerOfB.id } })).toMatchObject({
      deletedAt: null,
    });
  });

  it("including the company logo", async () => {
    const { a, b } = await twoCompanies();
    await companyService.setLogo(b, PNG);
    await companyService.removeLogo(a); // A has no logo: a no-op that must not affect B
    expect(await companyService.getLogo(b)).not.toBeNull();
  });
});

describe("own-company changes still work (the checks are not simply blocking everything)", () => {
  it("stamps company, creator and audit trail", async () => {
    const ctx = await createCompanyWithOwner("Gamma");
    const created = await customerService.create(ctx, { name: "Initech", email: "ap@initech.test" });
    expect(await rawDb.customer.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      companyId: ctx.companyId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });
    await customerService.update(ctx, created.id, { name: "Initech Ltd" });
    await customerService.remove(ctx, created.id);
    const audit = await rawDb.auditLog.findMany({
      where: { entityType: "Customer", entityId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      "customer.create",
      "customer.update",
      "customer.delete",
    ]);
    expect(audit.every((entry) => entry.companyId === ctx.companyId)).toBe(true);
  });

  it("an Employee of A still cannot change A's settings", async () => {
    const a = await createCompanyWithOwner("Delta");
    const { ctx: employee } = await addMember(a, "Employee");
    await expect(settingsService.set(employee, "general.weekStartsOn", 0)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
