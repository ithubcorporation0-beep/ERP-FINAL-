import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  allowedNavHrefs,
  findNavItem,
  landingPath,
  visibleNavSections,
} from "@/config/navigation";
import { DEFAULT_ROLES, expandPermissions } from "@/lib/permissions";

// Roles as stored in the database: wildcards expanded to concrete permission keys.
const rolePermissions = (name: string) => expandPermissions(DEFAULT_ROLES[name]?.permissions ?? []);

describe("navigation", () => {
  it("every nav item has a page, so the menu never links to a 404", () => {
    for (const item of NAV_ITEMS) {
      const page = path.resolve(
        import.meta.dirname,
        "../../src/app/(dashboard)",
        `.${item.href}`,
        "page.tsx",
      );
      expect(existsSync(page), `${item.href} has no page.tsx`).toBe(true);
    }
  });

  it("shows everything to the Owner role", () => {
    expect(allowedNavHrefs(rolePermissions("Super Admin"))).toHaveLength(NAV_ITEMS.length);
  });

  it("hides modules a role cannot read", () => {
    const hrefs = allowedNavHrefs(rolePermissions("Employee"));
    expect(hrefs).toEqual(["/dashboard", "/projects", "/notifications"]);
    expect(visibleNavSections(hrefs).map((section) => section.title)).toEqual([
      "Overview",
      "Operations",
      "Personal",
    ]);
  });

  it("matches sub-pages to their module", () => {
    expect(findNavItem("/crm")?.label).toBe("CRM");
    expect(findNavItem("/crm/customers/123")?.label).toBe("CRM");
    expect(findNavItem("/crm-other")).toBeUndefined();
  });

  it("lands each role on the first page it may open, or the profile page", () => {
    expect(landingPath(rolePermissions("Super Admin"))).toBe("/dashboard");
    expect(landingPath(rolePermissions("Customer"))).toBe("/profile");
  });

  it("shows administration pages only to roles that may view them", () => {
    expect(allowedNavHrefs(rolePermissions("Admin"))).toEqual(expect.arrayContaining(["/users", "/roles"]));
    expect(allowedNavHrefs(rolePermissions("Accountant"))).not.toContain("/users");
  });
});
