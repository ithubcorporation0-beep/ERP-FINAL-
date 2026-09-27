import { describe, expect, it } from "vitest";
import { hashToken } from "@/lib/auth/tokens";
import { ForbiddenError } from "@/lib/errors";
import { memberService } from "@/server/services/member.service";
import { companyContextService } from "@/server/services/company-context.service";
import { roleRepository } from "@/server/repositories/role.repository";
import { sessionRepository } from "@/server/repositories/session.repository";
import { createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

async function sessionFor(userId: string) {
  return sessionRepository.create({
    userId,
    tokenHash: hashToken(crypto.randomUUID()),
    expiresAt: new Date(Date.now() + 3_600_000),
    absoluteExpiresAt: new Date(Date.now() + 7_200_000),
  });
}

/** A user who belongs to two companies: owner of `home`, Employee in `other`. */
async function twoCompanyUser() {
  const home = await createCompanyWithOwner("Home Co");
  const other = await createCompanyWithOwner("Other Co");
  const user = await rawDb.user.findUniqueOrThrow({ where: { id: home.userId } });
  const employeeRole = await roleRepository.findByName(other.companyId, "Employee");
  if (!employeeRole) throw new Error("no role");
  const { membershipId } = await memberService.invite(other, {
    name: user.name,
    email: user.email,
    roleId: employeeRole.id,
  });
  return { home, other, userId: home.userId, membershipId };
}

describe("company context (current tenant resolver)", () => {
  it("lists every company the user belongs to", async () => {
    const { userId } = await twoCompanyUser();
    const companies = await companyContextService.listCompanies(userId);
    expect(companies.map((entry) => `${entry.company.name}:${entry.role.name}`)).toEqual([
      "Home Co:Super Admin",
      "Other Co:Employee",
    ]);
  });

  it("uses the switched-to company, with that company's role", async () => {
    const { other, userId } = await twoCompanyUser();
    const session = await sessionFor(userId);
    await companyContextService.switchCompany(userId, session.id, other.companyId);

    const stored = await rawDb.session.findUniqueOrThrow({ where: { id: session.id } });
    const access = await companyContextService.resolveAccess(userId, stored.activeCompanyId);
    expect(access).toMatchObject({ companyId: other.companyId, roleName: "Employee" });
  });

  it("refuses switching to a company the user doesn't belong to", async () => {
    const { userId } = await twoCompanyUser();
    const stranger = await createCompanyWithOwner("Stranger Co");
    const session = await sessionFor(userId);
    await expect(
      companyContextService.switchCompany(userId, session.id, stranger.companyId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("falls back to the user's own company when access to the switched-to one is suspended", async () => {
    const { home, other, userId, membershipId } = await twoCompanyUser();
    const session = await sessionFor(userId);
    await companyContextService.switchCompany(userId, session.id, other.companyId);
    await memberService.setSuspended(other, membershipId, true);

    const access = await companyContextService.resolveAccess(userId, other.companyId);
    expect(access?.companyId).toBe(home.companyId);
    await expect(
      companyContextService.switchCompany(userId, session.id, other.companyId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cannot change another user's session", async () => {
    const { other, userId } = await twoCompanyUser();
    const victim = await sessionFor(other.userId);
    await expect(
      companyContextService.switchCompany(userId, victim.id, other.companyId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
