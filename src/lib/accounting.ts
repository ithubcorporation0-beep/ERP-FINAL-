import { NORMAL_SIDE, type AccountTypeKey } from "@/config/accounting";
import { dateOnlyToDate } from "@/lib/date-range";
import { fromCents, money, toCents } from "@/lib/money";

/**
 * Pure accounting rules (no database), shared by services and tests. Amounts are exact decimal strings
 * (src/lib/money.ts). See docs/accounting.md for how they are used.
 */

export interface LineAmount {
  debit: string;
  credit: string;
}

export type EntryProblem =
  "too_few_lines" | "line_needs_one_side" | "negative_amount" | "unbalanced" | "zero_total";

/**
 * Double-entry check for one journal entry: at least two lines, each line is either a debit or a credit
 * (exactly one side > 0, none negative), and Σ debits = Σ credits > 0. Returns the totals or the first problem.
 */
export function checkEntry(
  lines: readonly LineAmount[],
): { ok: true; total: string } | { ok: false; problem: EntryProblem } {
  if (lines.length < 2) return { ok: false, problem: "too_few_lines" };
  let debits = 0n;
  let credits = 0n;
  for (const line of lines) {
    const debit = toCents(money(line.debit || "0"));
    const credit = toCents(money(line.credit || "0"));
    if (debit < 0n || credit < 0n) return { ok: false, problem: "negative_amount" };
    if (debit > 0n === credit > 0n) return { ok: false, problem: "line_needs_one_side" };
    debits += debit;
    credits += credit;
  }
  if (debits !== credits) return { ok: false, problem: "unbalanced" };
  if (debits === 0n) return { ok: false, problem: "zero_total" };
  return { ok: true, total: fromCents(debits) };
}

export const ENTRY_PROBLEM_MESSAGES: Record<EntryProblem, string> = {
  too_few_lines: "A transaction needs at least two lines.",
  line_needs_one_side: "Each line needs either a debit or a credit amount (not both).",
  negative_amount: "Amounts can't be negative.",
  unbalanced: "Total debits must equal total credits.",
  zero_total: "The transaction total can't be zero.",
};

/**
 * An account's balance on its normal side: debit − credit for assets and expenses, credit − debit for liabilities,
 * equity and revenue. A negative result means the account is on its "wrong" side (e.g. an overdrawn bank).
 */
export function normalBalance(type: AccountTypeKey, debit: string, credit: string): string {
  const difference = toCents(money(debit)) - toCents(money(credit));
  return fromCents(NORMAL_SIDE[type] === "debit" ? difference : -difference);
}

export const AGING_BUCKETS = ["current", "1-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];
export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Not yet due",
  "1-30": "1–30 days overdue",
  "31-60": "31–60 days overdue",
  "61-90": "61–90 days overdue",
  "90+": "More than 90 days overdue",
};

/** Whole days from `from` to `to` (calendar dates "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateOnlyToDate(to).getTime() - dateOnlyToDate(from).getTime()) / 86_400_000);
}

/** Aging bucket of an open item due on `dueDate`, as of `today`. Due today is not overdue. */
export function agingBucket(dueDate: string, today: string): AgingBucket {
  const overdue = daysBetween(dueDate, today);
  if (overdue <= 0) return "current";
  if (overdue <= 30) return "1-30";
  if (overdue <= 60) return "31-60";
  if (overdue <= 90) return "61-90";
  return "90+";
}

/** Adds amounts into a map (exact). */
export function addTo(map: Map<string, string>, key: string, amount: string) {
  map.set(key, fromCents(toCents(map.get(key) ?? "0.00") + toCents(money(amount))));
}

/** An expense approved on credit and not paid yet — owed to the vendor (Accounts Payable). */
export function isUnpaid(expense: { status: string; paymentMethod: string; paidAt: Date | null }): boolean {
  return expense.status === "APPROVED" && expense.paymentMethod === "UNPAID" && !expense.paidAt;
}
