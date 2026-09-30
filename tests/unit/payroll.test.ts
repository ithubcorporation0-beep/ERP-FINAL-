import { describe, expect, it } from "vitest";
import { PAYROLL_STATUSES, SALARY_ADVANCE_STATUSES, SALARY_COMPONENT_KINDS } from "@/config/payroll";
import { PayrollStatus, SalaryAdvanceStatus, SalaryComponentKind } from "@/generated/prisma/enums";
import {
  advancesToRecover,
  calculatePayroll,
  netSalary,
  PayrollAmountError,
  sumComponents,
  sumPayroll,
  type PayrollAmounts,
} from "@/lib/payroll";

const ZERO: PayrollAmounts = {
  basic: "0",
  allowances: "0",
  bonus: "0",
  overtime: "0",
  deductions: "0",
  tax: "0",
  advances: "0",
};

describe("salary formula: Net = Basic + Allowances + Bonus + Overtime − Deductions − Tax − Advances", () => {
  it("applies every component with the right sign", () => {
    expect(
      calculatePayroll({
        basic: "100000",
        allowances: "15000",
        bonus: "5000",
        overtime: "2500.50",
        deductions: "1200",
        tax: "8750.25",
        advances: "10000",
      }),
    ).toEqual({
      basic: "100000.00",
      allowances: "15000.00",
      bonus: "5000.00",
      overtime: "2500.50",
      deductions: "1200.00",
      tax: "8750.25",
      advances: "10000.00",
      gross: "122500.50",
      totalDeductions: "19950.25",
      net: "102550.25",
    });
  });

  it("changes the net by exactly each component", () => {
    const base = { ...ZERO, basic: "50000" };
    expect(netSalary(base)).toBe("50000.00");
    expect(netSalary({ ...base, allowances: "0.01" })).toBe("50000.01");
    expect(netSalary({ ...base, bonus: "0.01" })).toBe("50000.01");
    expect(netSalary({ ...base, overtime: "0.01" })).toBe("50000.01");
    expect(netSalary({ ...base, deductions: "0.01" })).toBe("49999.99");
    expect(netSalary({ ...base, tax: "0.01" })).toBe("49999.99");
    expect(netSalary({ ...base, advances: "0.01" })).toBe("49999.99");
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 − 0.3 = 0 exactly (in JS numbers it is 5.55e-17).
    expect(netSalary({ ...ZERO, basic: "0.1", allowances: "0.2", deductions: "0.3" })).toBe("0.00");
    // Large salaries stay exact beyond Number.MAX_SAFE_INTEGER cents.
    expect(netSalary({ ...ZERO, basic: "999999999999999.99", tax: "0.01" })).toBe("999999999999999.98");
  });

  it("treats empty components as zero and allows zero pay", () => {
    expect(netSalary({ ...ZERO, basic: "", allowances: "" })).toBe("0.00");
  });

  it("reports a negative net instead of hiding it", () => {
    expect(netSalary({ ...ZERO, basic: "1000", advances: "1500" })).toBe("-500.00");
  });

  it("refuses negative components and more than two decimals (no silent rounding)", () => {
    expect(() => calculatePayroll({ ...ZERO, bonus: "-5" })).toThrow(PayrollAmountError);
    expect(() => calculatePayroll({ ...ZERO, tax: "10.005" })).toThrow(/tax/);
    expect(() => calculatePayroll({ ...ZERO, basic: "12e3" })).toThrow(/basic/);
  });

  it("sums a salary structure's active components by kind", () => {
    const components = [
      { kind: "ALLOWANCE" as const, amount: "5000" },
      { kind: "ALLOWANCE" as const, amount: "2500.25" },
      { kind: "ALLOWANCE" as const, amount: "999", isActive: false },
      { kind: "DEDUCTION" as const, amount: { toString: () => "1200.5" } }, // Prisma Decimal prints like this
      { kind: "TAX" as const, amount: "3100" },
    ];
    expect(sumComponents(components, "ALLOWANCE")).toBe("7500.25");
    expect(sumComponents(components, "DEDUCTION")).toBe("1200.50");
    expect(sumComponents(components, "TAX")).toBe("3100.00");
  });

  it("totals many payslips exactly and checks that the nets add up", () => {
    const one = calculatePayroll({ ...ZERO, basic: "1000.10", tax: "0.20" });
    const two = calculatePayroll({ ...ZERO, basic: "2000.20", bonus: "0.10", advances: "100" });
    expect(sumPayroll([one, two])).toMatchObject({
      basic: "3000.30",
      bonus: "0.10",
      gross: "3000.40",
      totalDeductions: "100.20",
      net: "2900.20",
    });
    expect(() => sumPayroll([{ ...one, net: "1.00" }])).toThrow(/don't add up/);
  });
});

describe("advance recovery", () => {
  const advances = [
    { id: "a", amount: "3000" },
    { id: "b", amount: "5000.50" },
    { id: "c", amount: "100" },
  ];

  it("recovers whole advances, oldest first, while the net stays ≥ 0", () => {
    expect(advancesToRecover("10000", advances)).toEqual({ recovered: advances, total: "8100.50" });
    expect(advancesToRecover("8000.50", advances)).toEqual({
      recovered: advances.slice(0, 2),
      total: "8000.50",
    });
    // "b" doesn't fit, so it and everything after it waits for the next run (never split, order kept).
    expect(advancesToRecover("7999", advances)).toEqual({
      recovered: advances.slice(0, 1),
      total: "3000.00",
    });
    expect(advancesToRecover("0", advances)).toEqual({ recovered: [], total: "0.00" });
  });
});

describe("payroll vocabulary", () => {
  it("matches the database enums", () => {
    const sorted = (values: readonly string[]) => [...values].sort();
    expect(sorted(PAYROLL_STATUSES)).toEqual(sorted(Object.values(PayrollStatus)));
    expect(sorted(SALARY_COMPONENT_KINDS)).toEqual(sorted(Object.values(SalaryComponentKind)));
    expect(sorted(SALARY_ADVANCE_STATUSES)).toEqual(sorted(Object.values(SalaryAdvanceStatus)));
  });
});
