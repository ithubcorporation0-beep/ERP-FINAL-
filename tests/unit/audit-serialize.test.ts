import { describe, expect, it } from "vitest";
import { toAuditJson } from "@/lib/audit/serialize";

describe("toAuditJson", () => {
  it("serializes dates and objects with toJSON (e.g. Decimal) and drops undefined", () => {
    const decimalLike = { toJSON: () => "12.50" };
    expect(
      toAuditJson({ at: new Date("2026-01-02T03:04:05.000Z"), total: decimalLike, missing: undefined, n: 1 }),
    ).toEqual({ at: "2026-01-02T03:04:05.000Z", total: "12.50", n: 1 });
  });

  it("never writes secrets to the audit log", () => {
    expect(toAuditJson({ email: "a@b.c", passwordHash: "$2b$…", nested: [{ tokenHash: "abc" }] })).toEqual({
      email: "a@b.c",
      passwordHash: "[redacted]",
      nested: [{ tokenHash: "[redacted]" }],
    });
  });

  it("returns undefined for empty input so the column stays NULL", () => {
    expect(toAuditJson(undefined)).toBeUndefined();
    expect(toAuditJson(null)).toBeUndefined();
  });
});
