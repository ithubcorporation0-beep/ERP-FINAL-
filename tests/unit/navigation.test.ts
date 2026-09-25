import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS, allowedNavHrefs, findNavItem, visibleNavSections } from "@/config/navigation";
import { DEFAULT_ROLES } from "@/lib/permissions";

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
    expect(allowedNavHrefs(DEFAULT_ROLES.Owner ?? [])).toHaveLength(NAV_ITEMS.length);
  });

  it("hides modules a role cannot read", () => {
    const hrefs = allowedNavHrefs(DEFAULT_ROLES.Employee ?? []);
    expect(hrefs).toEqual(["/dashboard", "/projects", "/notifications"]);
    expect(visibleNavSections(hrefs).map((section) => section.title)).toEqual([
      "Overview",
      "Operations",
      "System",
    ]);
  });

  it("matches sub-pages to their module", () => {
    expect(findNavItem("/crm")?.label).toBe("CRM");
    expect(findNavItem("/crm/customers/123")?.label).toBe("CRM");
    expect(findNavItem("/crm-other")).toBeUndefined();
  });
});
