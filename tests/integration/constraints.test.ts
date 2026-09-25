import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ConflictError, toAppError } from "@/lib/errors";
import { companyRepository } from "@/server/repositories/company.repository";
import { createCompanyWithOwner } from "./helpers";

async function thrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the operation to fail");
}

describe("database-level guarantees", () => {
  it("rejects linking a user to another company's role (composite foreign key)", async () => {
    const companyA = await createCompanyWithOwner("North");
    const companyB = await createCompanyWithOwner("South");

    const error = await thrown(
      db.membership.create({
        data: { companyId: companyA.companyId, userId: companyB.userId, roleId: companyB.roleId },
      }),
    );
    expect(toAppError(error)).toBeInstanceOf(ConflictError);
  });

  it("rejects a role permission that points at another company's role", async () => {
    const companyA = await createCompanyWithOwner("East");
    const companyB = await createCompanyWithOwner("West");
    const permission = await db.permission.findFirstOrThrow();

    const error = await thrown(
      db.rolePermission.create({
        data: { companyId: companyA.companyId, roleId: companyB.roleId, permissionId: permission.id },
      }),
    );
    expect(toAppError(error)).toBeInstanceOf(ConflictError);
  });

  it("maps a duplicate company slug to a ConflictError", async () => {
    await companyRepository.create({ name: "Dup", slug: "dup" }, null);
    const error = await thrown(companyRepository.create({ name: "Dup again", slug: "dup" }, null));
    expect(toAppError(error)).toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("prevents hard-deleting a company that has audit history", async () => {
    const ctx = await createCompanyWithOwner("Archive Me");
    const error = await thrown(db.company.delete({ where: { id: ctx.companyId } }));
    expect(toAppError(error)).toBeInstanceOf(ConflictError);
    expect(await db.company.count({ where: { id: ctx.companyId } })).toBe(1);
  });
});
