import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { DEFAULT_ROLES, PERMISSION_CATALOG } from "@/lib/permissions";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { companyService } from "@/server/services/company.service";

const input = {
  company: { name: "Acme Holdings", slug: "acme-holdings" },
  owner: { email: "Owner@Acme.test", name: "Olivia Owner", password: "a-long-test-password" },
};

describe("companyService.bootstrap (seed workflow)", () => {
  it("creates the company, permission catalogue, built-in roles and a Super Admin with every permission", async () => {
    const result = await companyService.bootstrap(input);
    expect(result).toMatchObject({ createdCompany: true, createdOwner: true });

    expect(await db.permission.count()).toBe(PERMISSION_CATALOG.length);
    const roles = await db.role.findMany({
      where: { companyId: result.company.id },
      orderBy: { name: "asc" },
    });
    expect(roles.map((role) => role.name)).toEqual(Object.keys(DEFAULT_ROLES).sort());
    expect(roles.every((role) => role.isSystem)).toBe(true);

    const access = await membershipRepository.findAccess(result.ownerId, result.company.id);
    expect(access?.roleName).toBe("Super Admin");
    expect(access?.permissions).toHaveLength(PERMISSION_CATALOG.length);

    const owner = await db.user.findUniqueOrThrow({ where: { id: result.ownerId } });
    expect(owner.email).toBe("owner@acme.test");
    expect(owner.passwordHash).not.toContain("a-long-test-password");
  });

  it("is idempotent: running it again creates nothing new", async () => {
    await companyService.bootstrap(input);
    const counts = async () => ({
      companies: await db.company.count(),
      users: await db.user.count(),
      roles: await db.role.count(),
      rolePermissions: await db.rolePermission.count(),
      memberships: await db.membership.count(),
      auditLogs: await db.auditLog.count(),
    });
    const first = await counts();

    const again = await companyService.bootstrap(input);
    expect(again).toMatchObject({ createdCompany: false, createdOwner: false });
    expect(await counts()).toEqual(first);
  });

  it("records the creation in the audit log", async () => {
    const { company } = await companyService.bootstrap(input);
    const actions = await db.auditLog.findMany({
      where: { companyId: company.id },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action).sort()).toEqual(["company.create", "user.create"]);
  });
});
