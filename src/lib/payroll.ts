import { compareMoney, fromCents, money, toCents } from "@/lib/money";

/**
 * The payroll formula (pure, exact, shared by the server, the browser and the tests). Amounts are decimal strings
 * calculated in integer cents (src/lib/money.ts) — never JavaScript floating point. See docs/payroll.md.
 *
 *   Gross pay        = Basic Salary + Allowances + Bonus + Overtime
 *   Total deductions = Deductions + Tax + Advances
 *   Net Salary       = Gross pay − Total deductions
 *                    = Basic + Allowances + Bonus + Overtime − Deductions − Tax − Advances
 */

export interface PayrollAmounts {
  basic: string;
  allowances: string;
  bonus: string;
  overtime: string;
  deductions: string;
  tax: string;
  advances: string;
}

export interface PayrollResult extends PayrollAmounts {
  gross: string;
  totalDeductions: string;
  net: string;
}

export const PAYROLL_FIELDS = [
  "basic",
  "allowances",
  "bonus",
  "overtime",
  "deductions",
  "tax",
  "advances",
] as const satisfies ReadonlyArray<keyof PayrollAmounts>;

export class PayrollAmountError extends Error {
  constructor(readonly field: keyof PayrollAmounts) {
    super(`${field} must be a non-negative amount with at most 2 decimals`);
    this.name = "PayrollAmountError";
  }
}

/** Exact 2-decimal cents of one component; refuses negatives and more than 2 decimals (no silent rounding). */
function cents(value: string, field: keyof PayrollAmounts): bigint {
  const text = value.trim() === "" ? "0" : value.trim();
  if (!/^\d{1,15}(\.\d{1,2})?$/.test(text)) throw new PayrollAmountError(field);
  return toCents(text);
}

/** Applies the formula. Every component must be ≥ 0; the net may come out negative (callers refuse that). */
export function calculatePayroll(amounts: PayrollAmounts): PayrollResult {
  const value = {
    basic: cents(amounts.basic, "basic"),
    allowances: cents(amounts.allowances, "allowances"),
    bonus: cents(amounts.bonus, "bonus"),
    overtime: cents(amounts.overtime, "overtime"),
    deductions: cents(amounts.deductions, "deductions"),
    tax: cents(amounts.tax, "tax"),
    advances: cents(amounts.advances, "advances"),
  };
  const gross = value.basic + value.allowances + value.bonus + value.overtime;
  const totalDeductions = value.deductions + value.tax + value.advances;
  return {
    basic: fromCents(value.basic),
    allowances: fromCents(value.allowances),
    bonus: fromCents(value.bonus),
    overtime: fromCents(value.overtime),
    deductions: fromCents(value.deductions),
    tax: fromCents(value.tax),
    advances: fromCents(value.advances),
    gross: fromCents(gross),
    totalDeductions: fromCents(totalDeductions),
    net: fromCents(gross - totalDeductions),
  };
}

/** Net Salary only. */
export function netSalary(amounts: PayrollAmounts): string {
  return calculatePayroll(amounts).net;
}

export function isNegative(amount: string): boolean {
  return compareMoney(amount, "0.00") < 0;
}

export type ComponentKind = "ALLOWANCE" | "DEDUCTION" | "TAX";

/** Sum of a salary structure's active components of one kind. */
export function sumComponents(
  components: ReadonlyArray<{ kind: ComponentKind; amount: { toString(): string }; isActive?: boolean }>,
  kind: ComponentKind,
): string {
  return fromCents(
    components
      .filter((component) => component.kind === kind && component.isActive !== false)
      .reduce((total, component) => total + toCents(money(component.amount)), 0n),
  );
}

/** Totals of many payroll items (run totals, reports), exact. */
export function sumPayroll(items: ReadonlyArray<PayrollAmounts & { net: string }>): PayrollResult {
  const total = (field: keyof PayrollAmounts | "net") =>
    fromCents(items.reduce((sum, item) => sum + toCents(money(item[field])), 0n));
  const result = calculatePayroll({
    basic: total("basic"),
    allowances: total("allowances"),
    bonus: total("bonus"),
    overtime: total("overtime"),
    deductions: total("deductions"),
    tax: total("tax"),
    advances: total("advances"),
  });
  // The sum of the nets equals the net of the sums (the formula is linear); checked, not assumed.
  if (result.net !== total("net")) throw new Error("Payroll totals don't add up");
  return result;
}

/**
 * Which outstanding advances this payslip recovers: oldest first, each **in full**, as long as the net stays
 * ≥ 0. An advance that doesn't fit (and every later one) waits for the next payroll run — the net is never
 * pushed below zero and advances are never split.
 */
export function advancesToRecover<T extends { amount: { toString(): string } }>(
  netBeforeAdvances: string,
  outstanding: readonly T[],
): { recovered: T[]; total: string } {
  let available = toCents(money(netBeforeAdvances));
  const recovered: T[] = [];
  for (const advance of outstanding) {
    const amount = toCents(money(advance.amount));
    if (amount > available) break;
    recovered.push(advance);
    available -= amount;
  }
  return {
    recovered,
    total: fromCents(recovered.reduce((sum, advance) => sum + toCents(money(advance.amount)), 0n)),
  };
}
