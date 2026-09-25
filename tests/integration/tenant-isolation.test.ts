import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { customerService } from "@/server/services/customer.service";
import { createCompanyWithOwner } from "./helpers";

const page = { page: 1, pageSize: 20 };

describe("tenant isolation (customers reference module)", () => {
  it("never shows, changes or deletes another company's records", async () => {
    const companyA = await createCompanyWithOwner("Alpha");
    const companyB = await createCompanyWithOwner("Beta");
    const customerOfB = await customerService.create(companyB, { name: "Beta's customer" });

    expect((await customerService.list(companyA, page)).total).toBe(0);
    await expect(customerService.get(companyA, customerOfB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      customerService.update(companyA, customerOfB.id, { name: "Hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(customerService.remove(companyA, customerOfB.id)).rejects.toBeInstanceOf(NotFoundError);

    const unchanged = await db.customer.findUniqueOrThrow({ where: { id: customerOfB.id } });
    expect(unchanged).toMatchObject({ name: "Beta's customer", deletedAt: null });
  });

  it("stamps company_id, created_by and updated_by, and audits every change in the same company", async () => {
    const ctx = await createCompanyWithOwner("Gamma");
    const created = await customerService.create(ctx, { name: "Initech", email: "ap@initech.test" });
    expect(created).toMatchObject({
      companyId: ctx.companyId,
      createdById: ctx.userId,
      updatedById: ctx.userId,
    });

    const updated = await customerService.update(ctx, created.id, { name: "Initech Ltd" });
    expect(updated.name).toBe("Initech Ltd");
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());

    await customerService.remove(ctx, created.id);
    expect((await customerService.list(ctx, page)).total).toBe(0);
    expect(await db.customer.findUniqueOrThrow({ where: { id: created.id } })).toHaveProperty("deletedAt");

    const audit = await db.auditLog.findMany({
      where: { entityType: "Customer", entityId: created.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      "customer.create",
      "customer.update",
      "customer.delete",
    ]);
    expect(audit.every((entry) => entry.companyId === ctx.companyId && entry.actorId === ctx.userId)).toBe(
      true,
    );
  });
});
