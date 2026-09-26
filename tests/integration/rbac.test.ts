import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { can } from "@/lib/tenant";
import { roleRepository } from "@/server/repositories/role.repository";
import { memberService } from "@/server/services/member.service";
import { roleService } from "@/server/services/role.service";
import { addMember, contextFor, createCompanyWithOwner } from "./helpers";

const page = { page: 1, pageSize: 50 };

async function roleId(companyId: string, name: string) {
  const role = await roleRepository.findByName(companyId, name);
  if (!role) throw new Error(`No role ${name}`);
  return role.id;
}

async function membershipOf(companyId: string, userId: string) {
  return db.membership.findUniqueOrThrow({ where: { companyId_userId: { companyId, userId } } });
}

describe("role permissions are resolved from the database", () => {
  it("gives each built-in role exactly its permissions", async () => {
    const owner = await createCompanyWithOwner("Matrix Co");
    const { ctx: accountant } = await addMember(owner, "Accountant");
    const { ctx: employee } = await addMember(owner, "Employee");
    const { ctx: customer } = await addMember(owner, "Customer");

    expect(owner.permissions).toHaveLength(PERMISSION_KEYS.length);
    expect(can(accountant, "invoices:create")).toBe(true);
    expect(can(accountant, "employees:view")).toBe(false);
    expect(can(employee, "leaves:create")).toBe(true);
    expect(can(employee, "users:view")).toBe(false);
    expect(customer.permissions).toEqual([]);
  });
});

describe("users cannot perform unauthorized actions", () => {
  it("an Employee cannot list, invite or manage users, or manage roles", async () => {
    const owner = await createCompanyWithOwner("Guard Co");
    const { ctx: employee } = await addMember(owner, "Employee");
    const membership = await membershipOf(owner.companyId, owner.userId);

    await expect(memberService.list(employee, page)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      memberService.invite(employee, { name: "Eve", email: "eve@example.test", roleId: employee.roleId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(memberService.remove(employee, membership.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(roleService.list(employee)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      roleService.create(employee, { name: "Mine", description: "", permissions: ["users:manage"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a Manager can view users but not change them", async () => {
    const owner = await createCompanyWithOwner("View Co");
    const { ctx: manager } = await addMember(owner, "Manager");
    await expect(memberService.list(manager, page)).resolves.toMatchObject({ total: 2 });
    await expect(
      memberService.invite(manager, { name: "Max", email: "max@example.test", roleId: manager.roleId }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an Admin can manage users but cannot manage roles", async () => {
    const owner = await createCompanyWithOwner("Admin Co");
    const { ctx: admin } = await addMember(owner, "Admin");
    const employeeRole = await roleId(owner.companyId, "Employee");
    await expect(
      memberService.invite(admin, { name: "New Hire", email: "hire@example.test", roleId: employeeRole }),
    ).resolves.toMatchObject({ emailSent: true });
    await expect(
      roleService.create(admin, { name: "Custom", description: "", permissions: ["leads:view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("no privilege escalation", () => {
  it("an Admin cannot invite a Super Admin or touch an existing one", async () => {
    const owner = await createCompanyWithOwner("Escalation Co");
    const { ctx: admin } = await addMember(owner, "Admin");
    const superAdminRole = await roleId(owner.companyId, "Super Admin");

    await expect(
      memberService.invite(admin, { name: "Mallory", email: "mallory@example.test", roleId: superAdminRole }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const ownerMembership = await membershipOf(owner.companyId, owner.userId);
    await expect(
      memberService.changeRole(admin, ownerMembership.id, await roleId(owner.companyId, "Employee")),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(memberService.setSuspended(admin, ownerMembership.id, true)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(memberService.remove(admin, ownerMembership.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nobody can change their own access", async () => {
    const owner = await createCompanyWithOwner("Self Co");
    const { ctx: admin } = await addMember(owner, "Admin");
    const own = await membershipOf(owner.companyId, admin.userId);
    await expect(
      memberService.changeRole(admin, own.id, await roleId(owner.companyId, "Employee")),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(memberService.setSuspended(admin, own.id, true)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a role editor cannot grant permissions they don't hold", async () => {
    const owner = await createCompanyWithOwner("Roles Co");
    const limited = await roleService.create(owner, {
      name: "Role Manager",
      description: "",
      permissions: ["roles:view", "roles:manage", "leads:view"],
    });
    const { ctx: editor } = await addMember(owner, "Role Manager");
    expect(editor.roleId).toBe(limited.id);

    await expect(
      roleService.create(editor, { name: "Sneaky", description: "", permissions: ["settings:manage"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      roleService.create(editor, { name: "Fine", description: "", permissions: ["leads:view"] }),
    ).resolves.toHaveProperty("id");
  });
});

describe("safety rails", () => {
  it("keeps at least one active Super Admin", async () => {
    const owner = await createCompanyWithOwner("Last Co");
    // A custom role with every permission — so the actor may manage a Super Admin, without being one.
    await roleService.create(owner, { name: "Co-owner", description: "", permissions: [...PERMISSION_KEYS] });
    const { ctx: coOwner } = await addMember(owner, "Co-owner");
    const ownerMembership = await membershipOf(owner.companyId, owner.userId);

    await expect(memberService.remove(coOwner, ownerMembership.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(memberService.setSuspended(coOwner, ownerMembership.id, true)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(
      memberService.changeRole(coOwner, ownerMembership.id, await roleId(owner.companyId, "Admin")),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("built-in roles are read-only and roles in use can't be deleted", async () => {
    const owner = await createCompanyWithOwner("Builtin Co");
    const adminRole = await roleId(owner.companyId, "Admin");
    await expect(
      roleService.update(owner, adminRole, { name: "Admin", description: "", permissions: ["leads:view"] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(roleService.remove(owner, adminRole)).rejects.toBeInstanceOf(ForbiddenError);

    const custom = await roleService.create(owner, {
      name: "Temp",
      description: "",
      permissions: ["leads:view"],
    });
    await addMember(owner, "Temp");
    await expect(roleService.remove(owner, custom.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("role changes and suspensions take effect on the next request", async () => {
    const owner = await createCompanyWithOwner("Live Co");
    const { ctx: employee } = await addMember(owner, "Employee");
    const membership = await membershipOf(owner.companyId, employee.userId);

    await memberService.changeRole(owner, membership.id, await roleId(owner.companyId, "Accountant"));
    expect(can(await contextFor(employee.userId, owner.companyId), "invoices:view")).toBe(true);

    await memberService.setSuspended(owner, membership.id, true);
    await expect(contextFor(employee.userId, owner.companyId)).rejects.toThrow("No access");
    const actions = await db.auditLog.findMany({
      where: { entityId: membership.id },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["user.role_change", "user.suspend"]),
    );
  });
});

describe("company isolation for user and role management", () => {
  it("cannot see or change another company's members or roles", async () => {
    const alpha = await createCompanyWithOwner("Alpha Users");
    const beta = await createCompanyWithOwner("Beta Users");
    const betaMembership = await membershipOf(beta.companyId, beta.userId);
    const betaRole = await roleId(beta.companyId, "Employee");

    expect(
      (await memberService.list(alpha, page)).items.every((member) => member.user.id !== beta.userId),
    ).toBe(true);
    await expect(memberService.remove(alpha, betaMembership.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(memberService.changeRole(alpha, betaMembership.id, betaRole)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(
      memberService.invite(alpha, { name: "X", email: "x@example.test", roleId: betaRole }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(roleService.get(alpha, betaRole)).rejects.toBeInstanceOf(NotFoundError);
  });
});
