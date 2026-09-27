import { describe, expect, it } from "vitest";
import { TenantScopeError, crossTenant, db } from "@/lib/db";
import { createCompanyWithOwner } from "./helpers";

describe("tenant guard on the real database client", () => {
  it("rejects unscoped reads, updates, deletes and inserts on company-owned tables", async () => {
    const ctx = await createCompanyWithOwner("Guarded");
    await expect(db.customer.findMany()).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.role.findFirst({ where: { name: "Admin" } })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.customer.updateMany({ data: { name: "x" } })).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.setting.deleteMany()).rejects.toBeInstanceOf(TenantScopeError);
    // An upsert whose lookup isn't scoped by company is refused even though its insert data is.
    await expect(
      db.customer.upsert({
        where: { id: crypto.randomUUID() },
        create: { companyId: ctx.companyId, number: 1, name: "x" },
        update: { name: "x" },
      }),
    ).rejects.toBeInstanceOf(TenantScopeError);
    await expect(db.customer.findMany({ where: { companyId: ctx.companyId } })).resolves.toEqual([]);
  });

  it("applies inside transactions too", async () => {
    await createCompanyWithOwner("Guarded Tx");
    await expect(db.$transaction((tx) => tx.membership.findMany())).rejects.toBeInstanceOf(TenantScopeError);
  });

  it("allows deliberate, named cross-company queries", async () => {
    await createCompanyWithOwner("One");
    await createCompanyWithOwner("Two");
    const roles = await crossTenant("test: count roles in every company", () => db.role.count());
    expect(roles).toBeGreaterThanOrEqual(14);
    // …and the exception ends with the callback.
    await expect(db.role.count()).rejects.toBeInstanceOf(TenantScopeError);
  });
});
