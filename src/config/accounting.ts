/**
 * Accounting vocabulary shared by validation, server and UI. Value lists mirror the Prisma enums (checked by
 * tests/unit/accounting.test.ts) but live here so browser code never imports the Prisma client.
 * The posting rules that use these accounts are documented in docs/accounting.md.
 */

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
export type AccountTypeKey = (typeof ACCOUNT_TYPES)[number];
export const ACCOUNT_TYPE_LABELS: Record<AccountTypeKey, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expense",
};

/** The side on which an account type normally carries its balance (debit-normal or credit-normal). */
export const NORMAL_SIDE: Record<AccountTypeKey, "debit" | "credit"> = {
  ASSET: "debit",
  EXPENSE: "debit",
  LIABILITY: "credit",
  EQUITY: "credit",
  REVENUE: "credit",
};

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "PAYMENT", "PURCHASE", "SALES"] as const;
export type TransactionTypeKey = (typeof TRANSACTION_TYPES)[number];
export const TRANSACTION_TYPE_LABELS: Record<TransactionTypeKey, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  PAYMENT: "Payment",
  PURCHASE: "Purchase",
  SALES: "Sales",
};

export const EXPENSE_CATEGORIES = [
  "RENT",
  "UTILITIES",
  "SALARIES",
  "MARKETING",
  "TRANSPORTATION",
  "OFFICE_SUPPLIES",
  "SOFTWARE",
  "EQUIPMENT",
  "OTHER",
] as const;
export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryKey, string> = {
  RENT: "Rent",
  UTILITIES: "Utilities",
  SALARIES: "Salaries",
  MARKETING: "Marketing",
  TRANSPORTATION: "Transportation",
  OFFICE_SUPPLIES: "Office supplies",
  SOFTWARE: "Software",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
};

export const EXPENSE_PAYMENT_METHODS = [
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "ONLINE",
  "OTHER",
  "UNPAID",
] as const;
export type ExpensePaymentMethodKey = (typeof EXPENSE_PAYMENT_METHODS)[number];
export const EXPENSE_PAYMENT_METHOD_LABELS: Record<ExpensePaymentMethodKey, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  ONLINE: "Online payment",
  OTHER: "Other",
  UNPAID: "Not paid yet (owed to vendor)",
};
/** Label of a stored category value (anything unknown reads as "Other"). */
export function expenseCategoryLabel(key: string | null): string {
  const category = EXPENSE_CATEGORIES.find((candidate) => candidate === key);
  return category ? EXPENSE_CATEGORY_LABELS[category] : "Other";
}

/** Methods that mean the money has left the company. */
export const PAID_METHODS = EXPENSE_PAYMENT_METHODS.filter((method) => method !== "UNPAID");

export const EXPENSE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ExpenseStatusKey = (typeof EXPENSE_STATUSES)[number];
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatusKey, string> = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/** Keys of the system accounts automatic postings use. */
export type SystemAccountKey =
  | "cash"
  | "bank"
  | "receivable"
  | "assets"
  | "payable"
  | "tax_payable"
  | "liabilities"
  | "equity"
  | "revenue"
  | "other_income"
  | "purchases"
  | "expense_rent"
  | "expense_utilities"
  | "expense_salaries"
  | "expense_marketing"
  | "expense_transportation"
  | "expense_office_supplies"
  | "expense_software"
  | "expense_equipment"
  | "expense_other";

/** The expense account each category posts to. */
export const EXPENSE_ACCOUNT_KEYS: Record<ExpenseCategoryKey, SystemAccountKey> = {
  RENT: "expense_rent",
  UTILITIES: "expense_utilities",
  SALARIES: "expense_salaries",
  MARKETING: "expense_marketing",
  TRANSPORTATION: "expense_transportation",
  OFFICE_SUPPLIES: "expense_office_supplies",
  SOFTWARE: "expense_software",
  EQUIPMENT: "expense_equipment",
  OTHER: "expense_other",
};

export interface DefaultAccount {
  code: string;
  name: string;
  type: AccountTypeKey;
  systemKey: SystemAccountKey;
  description: string;
}

/** The chart of accounts every company starts with. Codes follow the common 1xxx–6xxx convention. */
export const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  {
    code: "1000",
    name: "Cash",
    type: "ASSET",
    systemKey: "cash",
    description: "Cash on hand. Cash payments go here.",
  },
  {
    code: "1010",
    name: "Bank",
    type: "ASSET",
    systemKey: "bank",
    description: "Bank accounts. Transfers, card and online payments go here.",
  },
  {
    code: "1100",
    name: "Accounts Receivable",
    type: "ASSET",
    systemKey: "receivable",
    description: "What customers owe for issued invoices.",
  },
  {
    code: "1500",
    name: "Other Assets",
    type: "ASSET",
    systemKey: "assets",
    description: "Equipment and other things the company owns.",
  },
  {
    code: "2000",
    name: "Accounts Payable",
    type: "LIABILITY",
    systemKey: "payable",
    description: "What the company owes vendors: unpaid expenses and supplier invoices.",
  },
  {
    code: "2100",
    name: "Tax Payable",
    type: "LIABILITY",
    systemKey: "tax_payable",
    description: "Tax charged on invoices, owed to the tax authority.",
  },
  {
    code: "2500",
    name: "Other Liabilities",
    type: "LIABILITY",
    systemKey: "liabilities",
    description: "Loans and other debts.",
  },
  {
    code: "3000",
    name: "Owner's Equity",
    type: "EQUITY",
    systemKey: "equity",
    description: "Capital put in by the owners.",
  },
  {
    code: "4000",
    name: "Sales Revenue",
    type: "REVENUE",
    systemKey: "revenue",
    description: "Invoiced sales, before tax.",
  },
  {
    code: "4900",
    name: "Other Income",
    type: "REVENUE",
    systemKey: "other_income",
    description: "Income that isn't from invoiced sales.",
  },
  {
    code: "5000",
    name: "Purchases",
    type: "EXPENSE",
    systemKey: "purchases",
    description: "Goods bought from suppliers (supplier invoices), expensed when billed.",
  },
  ...EXPENSE_CATEGORIES.map((category, index) => ({
    code: String(6000 + index * 10),
    name: category === "OTHER" ? "Other Expenses" : EXPENSE_CATEGORY_LABELS[category],
    type: "EXPENSE" as const,
    systemKey: EXPENSE_ACCOUNT_KEYS[category],
    description: `${EXPENSE_CATEGORY_LABELS[category]} expenses.`,
  })),
];

export function expenseAccountKey(category: ExpenseCategoryKey): SystemAccountKey {
  return EXPENSE_ACCOUNT_KEYS[category];
}

/** Where money comes from / goes to for a payment method: cash payments use Cash, everything else Bank. */
export function moneyAccountKey(method: string): "cash" | "bank" {
  return method === "CASH" ? "cash" : "bank";
}

export const FINANCIAL_REPORTS = [
  { slug: "profit-and-loss", label: "Profit & Loss", description: "Revenue minus expenses for a period." },
  { slug: "balance-sheet", label: "Balance Sheet", description: "Assets, liabilities and equity on a date." },
  { slug: "cash-flow", label: "Cash Flow", description: "Money in and out of Cash and Bank for a period." },
  { slug: "accounts-receivable", label: "Accounts Receivable", description: "What customers owe, by age." },
  {
    slug: "accounts-payable",
    label: "Accounts Payable",
    description: "Unpaid expenses owed to vendors, by age.",
  },
  { slug: "expenses", label: "Expense Report", description: "Approved expenses by category and vendor." },
  {
    slug: "revenue",
    label: "Revenue Report",
    description: "Invoiced revenue by month and customer, and cash received.",
  },
] as const;
export type FinancialReportSlug = (typeof FINANCIAL_REPORTS)[number]["slug"];
