import { describe, expect, it } from "vitest";
import { roundMoney } from "@/lib/utils";

describe("roundMoney", () => {
  it("rounds half away from zero without float drift", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(2.344)).toBe(2.34);
  });
});
