import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  DEFAULT_ROLES,
  MODULES,
  PERMISSION_CATALOG,
  expandPermissions,
  hasPermission,
  isPermissionKey,
} from "@/lib/permissions";

describe("hasPermission", () => {
  it("grants everything to the * wildcard", () => {
    expect(hasPermission(["*"], "invoices:delete")).toBe(true);
  });

  it("honours module wildcards", () => {
    expect(hasPermission(["invoices:*"], "invoices:approve")).toBe(true);
    expect(hasPermission(["invoices:*"], "payments:read")).toBe(false);
  });

  it("matches exact permissions only", () => {
    expect(hasPermission(["leads:read"], "leads:read")).toBe(true);
    expect(hasPermission(["leads:read"], "leads:create")).toBe(false);
  });
});

describe("permission catalogue", () => {
  it("has one unique entry per module and action", () => {
    expect(PERMISSION_CATALOG).toHaveLength(MODULES.length * ACTIONS.length);
    expect(new Set(PERMISSION_CATALOG.map((permission) => permission.key)).size).toBe(
      PERMISSION_CATALOG.length,
    );
    expect(isPermissionKey("customers:read")).toBe(true);
    expect(isPermissionKey("customers:fly")).toBe(false);
  });

  it("expands wildcards into concrete keys", () => {
    expect(expandPermissions(["*"])).toHaveLength(PERMISSION_CATALOG.length);
    expect(expandPermissions(["leads:*"])).toEqual(ACTIONS.map((action) => `leads:${action}`));
  });

  it("every default role references only real permissions", () => {
    for (const [name, role] of Object.entries(DEFAULT_ROLES)) {
      expect(expandPermissions(role.permissions).length, name).toBeGreaterThan(0);
    }
    expect(
      expandPermissions(DEFAULT_ROLES.Admin?.permissions ?? []).some((key) => key.startsWith("settings:")),
    ).toBe(false);
  });
});
