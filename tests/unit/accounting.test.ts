import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNTS,
  EXPENSE_ACCOUNT_KEYS,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  EXPENSE_STATUSES,
  moneyAccountKey,
  PAID_METHODS,
  TRANSACTION_TYPES,
} from "@/config/accounting";
import { formatRecordNumber, parseRecordNumber } from "@/config/records";
import {
  AccountType,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
  TransactionType,
} from "@/generated/prisma/enums";
import { addTo, agingBucket, checkEntry, daysBetween, isUnpaid, normalBalance } from "@/lib/accounting";
import {
  accountSchema,
  expensePaySchema,
  expenseRejectSchema,
  expenseSchema,
  journalEntrySchema,
  reportQuerySchema,
} from "@/lib/validation";

const sorted = (values: readonly string[]) => [...values].sort();
const ID = "0190a0a0-0000-7000-8000-000000000001";

describe("accounting vocabulary", () => {
  it("matches the database enums", () => {
    expect(sorted(ACCOUNT_TYPES)).toEqual(sorted(Object.values(AccountType)));
    expect(sorted(TRANSACTION_TYPES)).toEqual(sorted(Object.values(TransactionType)));
    expect(sorted(EXPENSE_CATEGORIES)).toEqual(sorted(Object.values(ExpenseCategory)));
    expect(sorted(EXPENSE_PAYMENT_METHODS)).toEqual(sorted(Object.values(ExpensePaymentMethod)));
    expect(sorted(EXPENSE_STATUSES)).toEqual(sorted(Object.values(ExpenseStatus)));
    expect(PAID_METHODS).not.toContain("UNPAID");
  });

  it("formats expense and journal numbers", () => {
    expect(formatRecordNumber("expense", 3)).toBe("EXP-0003");
    expect(formatRecordNumber("journal", 45)).toBe("JE-0045");
    expect(parseRecordNumber("journal", "je-45")).toBe(45);
  });

  it("has a unique default chart with an expense account for every category", () => {
    const codes = DEFAULT_ACCOUNTS.map((account) => account.code);
    const keys = DEFAULT_ACCOUNTS.map((account) => account.systemKey);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(keys).size).toBe(keys.length);
    for (const category of EXPENSE_CATEGORIES) {
      const account = DEFAULT_ACCOUNTS.find((row) => row.systemKey === EXPENSE_ACCOUNT_KEYS[category]);
      expect(account?.type).toBe("EXPENSE");
    }
    for (const key of [
      "cash",
      "bank",
      "receivable",
      "payable",
      "tax_payable",
      "equity",
      "revenue",
    ] as const) {
      expect(keys).toContain(key);
    }
  });

  it("posts cash payments to Cash and everything else to Bank", () => {
    expect(moneyAccountKey("CASH")).toBe("cash");
    expect(moneyAccountKey("BANK_TRANSFER")).toBe("bank");
    expect(moneyAccountKey("CARD")).toBe("bank");
  });
});

describe("double-entry check", () => {
  it("accepts balanced entries and returns the exact total", () => {
    expect(
      checkEntry([
        { debit: "100.10", credit: "" },
        { debit: "0.20", credit: "0" },
        { debit: "", credit: "100.30" },
      ]),
    ).toEqual({ ok: true, total: "100.30" });
    // 0.1 + 0.2 = 0.3 exactly (no floating point).
    expect(
      checkEntry([
        { debit: "0.1", credit: "" },
        { debit: "0.2", credit: "" },
        { debit: "", credit: "0.3" },
      ]),
    ).toEqual({ ok: true, total: "0.30" });
  });

  it("rejects unbalanced, one-line, two-sided, empty and zero entries", () => {
    expect(checkEntry([{ debit: "10", credit: "" }])).toEqual({ ok: false, problem: "too_few_lines" });
    expect(
      checkEntry([
        { debit: "10", credit: "" },
        { debit: "", credit: "9.99" },
      ]),
    ).toEqual({ ok: false, problem: "unbalanced" });
    expect(
      checkEntry([
        { debit: "10", credit: "10" },
        { debit: "", credit: "" },
      ]),
    ).toEqual({ ok: false, problem: "line_needs_one_side" });
    expect(
      checkEntry([
        { debit: "0", credit: "" },
        { debit: "", credit: "0" },
      ]),
    ).toEqual({ ok: false, problem: "line_needs_one_side" });
    expect(
      checkEntry([
        { debit: "-10", credit: "" },
        { debit: "", credit: "-10" },
      ]),
    ).toEqual({ ok: false, problem: "negative_amount" });
  });
});

describe("balances and aging", () => {
  it("shows balances on the account's normal side", () => {
    expect(normalBalance("ASSET", "1000", "250.50")).toBe("749.50");
    expect(normalBalance("EXPENSE", "80", "0")).toBe("80.00");
    expect(normalBalance("LIABILITY", "100", "350")).toBe("250.00");
    expect(normalBalance("REVENUE", "0", "1200")).toBe("1200.00");
    expect(normalBalance("EQUITY", "0", "0")).toBe("0.00");
    // An overdrawn bank account is a negative asset.
    expect(normalBalance("ASSET", "10", "25")).toBe("-15.00");
  });

  it("ages items by days past due; due today is current", () => {
    expect(daysBetween("2026-09-01", "2026-09-28")).toBe(27);
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30); // across DST changes
    expect(agingBucket("2026-09-28", "2026-09-28")).toBe("current");
    expect(agingBucket("2026-10-10", "2026-09-28")).toBe("current");
    expect(agingBucket("2026-09-27", "2026-09-28")).toBe("1-30");
    expect(agingBucket("2026-08-29", "2026-09-28")).toBe("1-30");
    expect(agingBucket("2026-08-28", "2026-09-28")).toBe("31-60");
    expect(agingBucket("2026-07-30", "2026-09-28")).toBe("31-60"); // exactly 60 days
    expect(agingBucket("2026-07-29", "2026-09-28")).toBe("61-90");
    expect(agingBucket("2026-06-01", "2026-09-28")).toBe("90+");
  });

  it("adds amounts into a map exactly", () => {
    const map = new Map<string, string>();
    addTo(map, "a", "0.1");
    addTo(map, "a", "0.2");
    addTo(map, "b", "5");
    expect(Object.fromEntries(map)).toEqual({ a: "0.30", b: "5.00" });
  });

  it("treats only approved, on-credit, not yet paid expenses as payable", () => {
    const base = { status: "APPROVED", paymentMethod: "UNPAID", paidAt: null };
    expect(isUnpaid(base)).toBe(true);
    expect(isUnpaid({ ...base, paidAt: new Date() })).toBe(false);
    expect(isUnpaid({ ...base, status: "PENDING" })).toBe(false);
    expect(isUnpaid({ ...base, paymentMethod: "CASH" })).toBe(false);
  });
});

describe("accounting validation", () => {
  const expense = {
    category: "RENT",
    amount: "1500.00",
    expenseDate: "2026-09-01",
    vendor: "Landlord",
    paymentMethod: "BANK_TRANSFER",
    description: "September rent",
    employeeId: "",
  };

  it("validates expenses", () => {
    expect(expenseSchema.safeParse(expense).success).toBe(true);
    expect(expenseSchema.safeParse({ ...expense, amount: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, amount: "-5" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, amount: "10.999" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, category: "FOOD" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, description: " " }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...expense, employeeId: "not-an-id" }).success).toBe(false);
  });

  it("requires a rejection reason and a real payment method to mark paid", () => {
    expect(expenseRejectSchema.safeParse({ id: ID, note: "" }).success).toBe(false);
    expect(expenseRejectSchema.safeParse({ id: ID, note: "Duplicate claim" }).success).toBe(true);
    expect(expensePaySchema.safeParse({ id: ID, method: "UNPAID", paidAt: "2026-09-02" }).success).toBe(
      false,
    );
    expect(expensePaySchema.safeParse({ id: ID, method: "CASH", paidAt: "2026-09-02" }).success).toBe(true);
  });

  it("validates accounts and journal entries", () => {
    expect(accountSchema.safeParse({ code: "6100", name: "Travel", type: "EXPENSE" }).success).toBe(true);
    expect(accountSchema.safeParse({ code: "61 00", name: "Travel", type: "EXPENSE" }).success).toBe(false);
    expect(accountSchema.safeParse({ code: "6100", name: "Travel", type: "COST" }).success).toBe(false);
    const entry = {
      type: "PAYMENT",
      entryDate: "2026-09-01",
      description: "Owner deposit",
      lines: [
        { accountId: ID, debit: "100", credit: "" },
        { accountId: ID, debit: "", credit: "100" },
      ],
    };
    expect(journalEntrySchema.safeParse(entry).success).toBe(true);
    expect(journalEntrySchema.safeParse({ ...entry, lines: entry.lines.slice(0, 1) }).success).toBe(false);
    expect(
      journalEntrySchema.safeParse({
        ...entry,
        lines: [{ ...entry.lines[0], debit: "1.234" }, entry.lines[1]],
      }).success,
    ).toBe(false);
  });

  it("falls back to this fiscal year for unknown report periods", () => {
    expect(reportQuerySchema.parse({ range: "nonsense" }).range).toBe("this-fiscal-year");
    expect(reportQuerySchema.parse({ asOf: "bad" }).asOf).toBeUndefined();
  });
});
