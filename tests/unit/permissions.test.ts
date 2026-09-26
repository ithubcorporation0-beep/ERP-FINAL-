import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLES,
  PERMISSION_CATALOG,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  SUPER_ADMIN_ROLE,
  expandPermissions,
  hasAnyPermission,
  hasPermission,
  isPermissionKey,
} from "@/lib/permissions";

const REQUIRED_ACTIONS = ["view", "create", "edit", "delete", "export", "approve", "reject", "manage"];
const REQUIRED_ROLES = [
  SUPER_ADMIN_ROLE,
  "Admin",
  "Manager",
  "Accountant",
  "HR Manager",
  "Employee",
  "Customer",
];

describe("permission constants", () => {
  it("are unique, well-formed and cover every required action", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z-]+:[a-z]+$/);
    const actions = new Set(PERMISSION_CATALOG.map((permission) => permission.action));
    expect([...actions].sort()).toEqual([...REQUIRED_ACTIONS].sort());
  });

  it("include manage settings, users and roles", () => {
    expect(PERMISSION_KEYS).toEqual(
      expect.arrayContaining(["settings:manage", "users:manage", "roles:manage"]),
    );
  });

  it("group every permission under its module exactly once", () => {
    expect(PERMISSION_GROUPS.flatMap((group) => group.permissions)).toHaveLength(PERMISSION_KEYS.length);
    expect(new Set(PERMISSION_GROUPS.map((group) => group.module)).size).toBe(PERMISSION_GROUPS.length);
  });

  it("recognize only real keys", () => {
    expect(isPermissionKey("customers:view")).toBe(true);
    expect(isPermissionKey("customers:read")).toBe(false);
    expect(isPermissionKey("users:delete")).toBe(false);
  });
});

describe("hasPermission", () => {
  it("grants everything to the * wildcard and a whole module to module:*", () => {
    expect(hasPermission(["*"], "settings:manage")).toBe(true);
    expect(hasPermission(["invoices:*"], "invoices:delete")).toBe(true);
    expect(hasPermission(["invoices:*"], "payments:view")).toBe(false);
  });

  it("matches exact permissions only (no implied permissions)", () => {
    expect(hasPermission(["leads:view"], "leads:view")).toBe(true);
    expect(hasPermission(["leads:view"], "leads:edit")).toBe(false);
    expect(hasPermission(["users:view"], "users:manage")).toBe(false);
    expect(hasAnyPermission(["leads:view"], ["leads:edit", "leads:view"])).toBe(true);
  });

  it("denies everything to an empty permission list", () => {
    expect(PERMISSION_KEYS.some((key) => hasPermission([], key))).toBe(false);
  });
});

describe("default roles", () => {
  const permissionsOf = (role: string) => new Set(expandPermissions(DEFAULT_ROLES[role]?.permissions ?? []));

  it("exist exactly as required", () => {
    expect(Object.keys(DEFAULT_ROLES).sort()).toEqual([...REQUIRED_ROLES].sort());
  });

  it("only reference real permissions", () => {
    for (const role of Object.values(DEFAULT_ROLES)) {
      for (const pattern of role.permissions) {
        expect(pattern === "*" || pattern.endsWith(":*") || isPermissionKey(pattern), pattern).toBe(true);
      }
    }
  });

  it("give Super Admin everything and Admin everything except roles and company settings", () => {
    expect(permissionsOf(SUPER_ADMIN_ROLE).size).toBe(PERMISSION_KEYS.length);
    const admin = permissionsOf("Admin");
    expect(admin.has("users:manage")).toBe(true);
    expect(admin.has("roles:manage")).toBe(false);
    expect(admin.has("settings:manage")).toBe(false);
  });

  it("keep sensitive administration away from operational roles", () => {
    for (const role of ["Manager", "Accountant", "HR Manager", "Employee", "Customer"]) {
      const permissions = permissionsOf(role);
      expect(permissions.has("users:manage"), role).toBe(false);
      expect(permissions.has("roles:manage"), role).toBe(false);
      expect(permissions.has("settings:manage"), role).toBe(false);
    }
  });

  it("scope each role to its job", () => {
    expect(permissionsOf("Accountant").has("accounting:edit")).toBe(true);
    expect(permissionsOf("Accountant").has("employees:view")).toBe(false);
    expect(permissionsOf("HR Manager").has("payroll:approve")).toBe(true);
    expect(permissionsOf("HR Manager").has("invoices:view")).toBe(false);
    expect(permissionsOf("Manager").has("leaves:approve")).toBe(true);
    expect(permissionsOf("Employee").has("leaves:create")).toBe(true);
    expect(permissionsOf("Employee").has("leaves:approve")).toBe(false);
    expect(permissionsOf("Customer").size).toBe(0);
  });
});
