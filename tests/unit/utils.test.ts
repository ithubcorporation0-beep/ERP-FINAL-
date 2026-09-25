import { describe, expect, it } from "vitest";
import { initials, roundMoney } from "@/lib/utils";

describe("roundMoney", () => {
  it("rounds half away from zero without float drift", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(2.344)).toBe(2.34);
  });
});

describe("initials", () => {
  it("uses first and last name initials", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("  Grace  Brewster Hopper ")).toBe("GH");
    expect(initials("admin")).toBe("AD");
    expect(initials("")).toBe("?");
  });
});
