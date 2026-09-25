import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/permissions";

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
