import { describe, expect, it } from "vitest";
import {
  addMoney,
  calculateLine,
  calculateTotals,
  compareMoney,
  fromScaled,
  money,
  rescale,
  subtractMoney,
  sumMoney,
  toScaled,
} from "@/lib/money";

describe("exact decimals", () => {
  it("parses and prints without floating-point drift", () => {
    expect(toScaled("12.5", 2)).toBe(1250n);
    expect(toScaled("-0.07", 2)).toBe(-7n);
    expect(fromScaled(1250n, 2)).toBe("12.50");
    expect(fromScaled(-7n, 2)).toBe("-0.07");
    expect(fromScaled(5n, 3)).toBe("0.005");
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30"); // 0.1 + 0.2 === 0.30000000000000004 in floats
    expect(sumMoney(Array.from({ length: 10 }, () => "0.10"))).toBe("1.00");
    expect(money("12.5")).toBe("12.50");
    expect(money("7")).toBe("7.00");
  });

  it("refuses anything that isn't a plain decimal", () => {
    for (const bad of ["", "1e3", "1,50", "12.505", "abc", "0x10", " 1 2"]) {
      expect(() => toScaled(bad, 2), bad).toThrow();
    }
  });

  it("rounds half away from zero", () => {
    expect(rescale(1005n, 3, 2)).toBe(101n); // 1.005 → 1.01 (floats give 1.00)
    expect(rescale(-1005n, 3, 2)).toBe(-101n);
    expect(rescale(1004n, 3, 2)).toBe(100n);
    expect(rescale(125n, 2, 2)).toBe(125n);
    expect(rescale(5n, 2, 4)).toBe(500n);
  });

  it("compares, adds and subtracts", () => {
    expect(compareMoney("10.00", "9.99")).toBe(1);
    expect(compareMoney("0.30", sumMoney(["0.10", "0.20"]))).toBe(0);
    expect(subtractMoney("100.00", "33.33")).toBe("66.67");
    expect(addMoney("0.01", "0.02")).toBe("0.03");
  });
});

describe("invoice line calculation", () => {
  it("applies quantity, discount and tax with per-step rounding", () => {
    expect(calculateLine({ quantity: "3", unitPrice: "19.99", discountPercent: "10", taxRate: "5" })).toEqual(
      {
        lineSubtotal: "59.97",
        discountAmount: "6.00", // 5.997 → 6.00
        taxAmount: "2.70", // 53.97 × 5% = 2.6985 → 2.70
        lineTotal: "56.67",
      },
    );
    expect(calculateLine({ quantity: "1.5", unitPrice: "0.35", discountPercent: "0", taxRate: "0" })).toEqual(
      {
        lineSubtotal: "0.53", // 0.525 → 0.53
        discountAmount: "0.00",
        taxAmount: "0.00",
        lineTotal: "0.53",
      },
    );
    expect(
      calculateLine({ quantity: "0.001", unitPrice: "1.00", discountPercent: "0", taxRate: "15" }),
    ).toMatchObject({ lineSubtotal: "0.00", lineTotal: "0.00" });
  });

  it("handles large amounts exactly", () => {
    const line = calculateLine({
      quantity: "999999999.999",
      unitPrice: "99999.99",
      discountPercent: "12.5",
      taxRate: "18",
    });
    expect(line.lineSubtotal).toBe("99999989999900.00"); // beyond Number's exact integer range in cents
    expect(line.discountAmount).toBe("12499998749987.50");
    expect(line.lineTotal).toBe(
      addMoney(subtractMoney(line.lineSubtotal, line.discountAmount), line.taxAmount),
    );
  });

  it("totals are the exact sums of the lines", () => {
    const lines = [
      calculateLine({ quantity: "2", unitPrice: "100", discountPercent: "0", taxRate: "5" }),
      calculateLine({ quantity: "1", unitPrice: "49.99", discountPercent: "100", taxRate: "5" }),
      calculateLine({ quantity: "3", unitPrice: "0.10", discountPercent: "0", taxRate: "0" }),
    ];
    expect(calculateTotals(lines)).toEqual({
      subtotal: "250.29",
      discountTotal: "49.99",
      taxTotal: "10.00",
      total: "210.30",
    });
    expect(calculateTotals([])).toEqual({
      subtotal: "0.00",
      discountTotal: "0.00",
      taxTotal: "0.00",
      total: "0.00",
    });
  });
});
