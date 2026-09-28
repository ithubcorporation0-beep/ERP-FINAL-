import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  type ExpenseCategoryKey,
  type ExpenseStatusKey,
  type TransactionTypeKey,
} from "@/config/accounting";
import { formatRecordNumber } from "@/config/records";
import type { SalesRow } from "@/features/sales/sales-lists";
import { isUnpaid } from "@/lib/accounting";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { money, sumMoney } from "@/lib/money";
import { EXPENSE_STATUS_TONES } from "./labels";

/** Server-side mapping from finance records to preformatted list rows (company locale, exact money). */

type Money = { toString(): string };

export function expenseRow(
  expense: {
    id: string;
    number: number;
    category: ExpenseCategoryKey;
    status: ExpenseStatusKey;
    expenseDate: Date;
    amount: Money;
    currency: string;
    vendor: string | null;
    paymentMethod: string;
    paidAt: Date | null;
    employee: { name: string } | null;
  },
  { locale }: { locale: string },
): SalesRow {
  const unpaid = isUnpaid(expense);
  return {
    id: expense.id,
    href: `/finance/expenses/${expense.id}`,
    code: formatRecordNumber("expense", expense.number),
    reference: expense.vendor,
    customer: expense.employee?.name ?? "—",
    date: formatCalendarDate(expense.expenseDate, { locale }),
    secondary: `${EXPENSE_CATEGORY_LABELS[expense.category]}${unpaid ? " · unpaid" : ""}`,
    secondaryAlert: unpaid,
    amount: formatMoney(money(expense.amount), { locale, currency: expense.currency }) ?? "",
    status: { label: EXPENSE_STATUS_LABELS[expense.status], tone: EXPENSE_STATUS_TONES[expense.status] },
  };
}

export function journalRow(
  entry: {
    id: string;
    number: number;
    type: TransactionTypeKey;
    entryDate: Date;
    description: string;
    reference: string | null;
    sourceType: string;
    reversalOfId: string | null;
    reversals: { id: string }[];
    lines: { debit: Money }[];
  },
  { locale, currency }: { locale: string; currency: string },
): SalesRow {
  const status: SalesRow["status"] = entry.reversalOfId
    ? { label: "Reversal", tone: "neutral" }
    : entry.reversals.length > 0
      ? { label: "Reversed", tone: "danger" }
      : entry.sourceType === "MANUAL"
        ? { label: "Manual", tone: "info" }
        : { label: "Automatic", tone: "success" };
  return {
    id: entry.id,
    href: `/finance/transactions/${entry.id}`,
    code: formatRecordNumber("journal", entry.number),
    reference: entry.reference,
    customer: entry.description,
    date: formatCalendarDate(entry.entryDate, { locale }),
    secondary: TRANSACTION_TYPE_LABELS[entry.type],
    amount: formatMoney(sumMoney(entry.lines.map((line) => money(line.debit))), { locale, currency }) ?? "",
    status,
  };
}
