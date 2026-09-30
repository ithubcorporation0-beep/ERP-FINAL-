/**
 * Payroll vocabulary shared by validation, server and UI. Value lists mirror the Prisma enums (checked by
 * tests/unit/payroll.test.ts) but live here so browser code never imports the Prisma client. Rules: docs/payroll.md.
 */

export const PAYROLL_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PAID", "CANCELLED"] as const;
export type PayrollStatusKey = (typeof PAYROLL_STATUSES)[number];
export const PAYROLL_STATUS_LABELS: Record<PayrollStatusKey, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Waiting for approval",
  APPROVED: "Approved",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

export const SALARY_COMPONENT_KINDS = ["ALLOWANCE", "DEDUCTION", "TAX"] as const;
export type SalaryComponentKindKey = (typeof SALARY_COMPONENT_KINDS)[number];
export const SALARY_COMPONENT_KIND_LABELS: Record<SalaryComponentKindKey, string> = {
  ALLOWANCE: "Allowance",
  DEDUCTION: "Deduction",
  TAX: "Tax",
};

export const SALARY_ADVANCE_STATUSES = ["OUTSTANDING", "RECOVERED", "CANCELLED"] as const;
export type SalaryAdvanceStatusKey = (typeof SALARY_ADVANCE_STATUSES)[number];
export const SALARY_ADVANCE_STATUS_LABELS: Record<SalaryAdvanceStatusKey, string> = {
  OUTSTANDING: "Outstanding",
  RECOVERED: "Recovered",
  CANCELLED: "Cancelled",
};

/** The editable per-run inputs of a payroll item (basic, allowances, deductions and tax come from the structure). */
export const PAYROLL_LINE_LABELS = {
  basic: "Basic salary",
  allowances: "Allowances",
  bonus: "Bonus",
  overtime: "Overtime",
  deductions: "Deductions",
  tax: "Tax",
  advances: "Advances",
  net: "Net salary",
} as const;

/** "September 2026". */
export function periodLabel(year: number, month: number, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}
