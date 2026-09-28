import "server-only";
import {
  DEFAULT_ACCOUNTS,
  expenseAccountKey,
  moneyAccountKey,
  type ExpenseCategoryKey,
  type SystemAccountKey,
  type TransactionTypeKey,
} from "@/config/accounting";
import { formatRecordNumber } from "@/config/records";
import { checkEntry, ENTRY_PROBLEM_MESSAGES } from "@/lib/accounting";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { compareMoney, money, subtractMoney } from "@/lib/money";
import { accountRepository } from "@/server/repositories/account.repository";
import { companyRepository } from "@/server/repositories/company.repository";
import type { ActorId, DbClient } from "@/server/repositories/helpers";
import { journalRepository, type JournalLineData } from "@/server/repositories/journal.repository";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";

/**
 * The posting engine and the automatic posting rules (docs/accounting.md). Every entry is checked with exact
 * arithmetic before it is written (≥ 2 lines, each one-sided, Σ debit = Σ credit) and the database checks the
 * balance again at commit. Automatic postings carry a `postingKey`, so posting the same event twice is a no-op.
 * Functions take a transaction client: postings are written in the same transaction as the business change.
 */

export interface PostingLine {
  /** A system account (automatic postings) or an account id (manual entries). */
  account: { systemKey: SystemAccountKey } | { id: string };
  debit?: string;
  credit?: string;
  description?: string | null;
}

export interface Posting {
  type: TransactionTypeKey;
  /** "YYYY-MM-DD". */
  date: string;
  description: string;
  reference?: string | null;
  postingKey: string | null;
  sourceType: "INVOICE" | "PAYMENT" | "EXPENSE" | "MANUAL";
  sourceId: string | null;
  reversalOfId?: string | null;
  lines: PostingLine[];
}

const SOURCE_TYPES = ["INVOICE", "PAYMENT", "EXPENSE", "MANUAL"] as const;

function sourceTypeOf(value: string): Posting["sourceType"] {
  const known = SOURCE_TYPES.find((type) => type === value);
  if (!known) throw new Error(`Unknown journal source type: ${value}`);
  return known;
}

/** Creates the default chart of accounts (idempotent; existing accounts are untouched). */
async function ensureAccounts(companyId: string, client: DbClient) {
  await accountRepository.createDefaults(companyId, DEFAULT_ACCOUNTS, client);
}

async function resolveLines(
  companyId: string,
  lines: readonly PostingLine[],
  client: DbClient,
): Promise<JournalLineData[]> {
  const keys = lines.flatMap((line) => ("systemKey" in line.account ? [line.account.systemKey] : []));
  let byKey = new Map<string, string>();
  if (keys.length > 0) {
    let accounts = await accountRepository.findSystem(companyId, keys, client);
    if (accounts.length < new Set(keys).size) {
      await ensureAccounts(companyId, client);
      accounts = await accountRepository.findSystem(companyId, keys, client);
    }
    byKey = new Map(
      accounts.flatMap((account) => (account.systemKey ? [[account.systemKey, account.id]] : [])),
    );
  }
  return lines.map((line) => {
    const accountId = "id" in line.account ? line.account.id : byKey.get(line.account.systemKey);
    if (!accountId) throw new Error(`System account missing: ${JSON.stringify(line.account)}`);
    return {
      accountId,
      debit: money(line.debit || "0"),
      credit: money(line.credit || "0"),
      description: line.description ?? null,
    };
  });
}

/** Writes one balanced entry. Returns the existing entry when `postingKey` was already posted. */
async function post(companyId: string, actorId: ActorId, posting: Posting, client: DbClient) {
  if (posting.postingKey) {
    const existing = await journalRepository.findByPostingKey(companyId, posting.postingKey, client);
    if (existing) return existing;
  }
  const lines = await resolveLines(companyId, posting.lines, client);
  const check = checkEntry(lines);
  if (!check.ok)
    throw new ValidationError(ENTRY_PROBLEM_MESSAGES[check.problem], {
      lines: [ENTRY_PROBLEM_MESSAGES[check.problem]],
    });
  const number = await numberSequenceRepository.next(companyId, "journal", client);
  return journalRepository.create(
    companyId,
    number,
    {
      type: posting.type,
      entryDate: dateOnlyToDate(posting.date),
      description: posting.description,
      reference: posting.reference ?? null,
      postingKey: posting.postingKey,
      sourceType: posting.sourceType,
      sourceId: posting.sourceId,
      reversalOfId: posting.reversalOfId ?? null,
    },
    lines,
    actorId,
    client,
  );
}

/**
 * Reverses an entry: the same lines with debit and credit swapped, dated `date`. The original stays untouched.
 * Returns null when there is nothing to reverse (e.g. a draft invoice that was never posted).
 */
async function reverse(
  companyId: string,
  actorId: ActorId,
  original: { postingKey: string } | { id: string },
  reversal: { postingKey: string | null; date: string; description: string },
  client: DbClient,
) {
  const entry =
    "postingKey" in original
      ? await journalRepository.findByPostingKey(companyId, original.postingKey, client)
      : await journalRepository.findById(companyId, original.id, client);
  if (!entry) return null;
  if (entry.reversalOfId) throw new ValidationError("A reversing entry can't be reversed again.");
  if (entry.reversals.length > 0 && !reversal.postingKey) {
    throw new ValidationError("This transaction has already been reversed.");
  }
  return post(
    companyId,
    actorId,
    {
      type: entry.type,
      date: reversal.date,
      description: reversal.description,
      reference: formatRecordNumber("journal", entry.number),
      postingKey: reversal.postingKey,
      sourceType: sourceTypeOf(entry.sourceType),
      sourceId: entry.sourceId,
      reversalOfId: entry.id,
      lines: entry.lines.map((line) => ({
        account: { id: line.account.id },
        debit: line.credit.toString(),
        credit: line.debit.toString(),
        description: line.description,
      })),
    },
    client,
  );
}

// ─── Automatic posting rules (docs/accounting.md → "Posting rules") ───

interface InvoiceForPosting {
  id: string;
  code: string;
  invoiceDate: Date;
  subtotal: { toString(): string };
  discountTotal: { toString(): string };
  taxTotal: { toString(): string };
  total: { toString(): string };
  customer: { name: string };
}

/** Rule S1 — invoice issued: Dr Accounts Receivable (total) / Cr Sales Revenue (net of discount) / Cr Tax Payable. */
function invoicePosting(invoice: InvoiceForPosting): Posting {
  const net = subtractMoney(money(invoice.subtotal), money(invoice.discountTotal));
  const tax = money(invoice.taxTotal);
  return {
    type: "SALES",
    date: invoice.invoiceDate.toISOString().slice(0, 10),
    description: `Invoice ${invoice.code} — ${invoice.customer.name}`,
    reference: invoice.code,
    postingKey: `invoice:${invoice.id}:issue`,
    sourceType: "INVOICE",
    sourceId: invoice.id,
    lines: [
      { account: { systemKey: "receivable" }, debit: money(invoice.total) },
      { account: { systemKey: "revenue" }, credit: net },
      ...(compareMoney(tax, "0.00") > 0
        ? [{ account: { systemKey: "tax_payable" } as const, credit: tax }]
        : []),
    ],
  };
}

interface PaymentForPosting {
  id: string;
  number: number;
  amount: { toString(): string };
  method: string;
  paymentDate: Date;
  invoice: { code: string };
  customer: { name: string };
}

export const ledgerService = {
  ensureAccounts: (companyId: string, client: DbClient = db) => ensureAccounts(companyId, client),
  post,
  reverse,

  /** Rule S1. Zero-value invoices are not posted (nothing to record). */
  async postInvoiceIssued(companyId: string, actorId: ActorId, invoice: InvoiceForPosting, client: DbClient) {
    if (compareMoney(money(invoice.total), "0.00") === 0) return null;
    return post(companyId, actorId, invoicePosting(invoice), client);
  },

  /** Rule S2 — invoice cancelled after it was issued: reversal of S1, dated the cancellation day. */
  postInvoiceCancelled(
    companyId: string,
    actorId: ActorId,
    invoice: { id: string; code: string },
    date: string,
    client: DbClient,
  ) {
    return reverse(
      companyId,
      actorId,
      { postingKey: `invoice:${invoice.id}:issue` },
      { postingKey: `invoice:${invoice.id}:cancel`, date, description: `Invoice ${invoice.code} cancelled` },
      client,
    );
  },

  /** Rule S3 — payment received: Dr Cash (cash) or Bank (all other methods) / Cr Accounts Receivable. */
  postPaymentReceived(companyId: string, actorId: ActorId, payment: PaymentForPosting, client: DbClient) {
    const code = formatRecordNumber("payment", payment.number);
    return post(
      companyId,
      actorId,
      {
        type: "PAYMENT",
        date: payment.paymentDate.toISOString().slice(0, 10),
        description: `Payment ${code} for ${payment.invoice.code} — ${payment.customer.name}`,
        reference: code,
        postingKey: `payment:${payment.id}`,
        sourceType: "PAYMENT",
        sourceId: payment.id,
        lines: [
          { account: { systemKey: moneyAccountKey(payment.method) }, debit: money(payment.amount) },
          { account: { systemKey: "receivable" }, credit: money(payment.amount) },
        ],
      },
      client,
    );
  },

  /** Rule S4 — payment voided: reversal of S3, dated the void day. */
  postPaymentVoided(
    companyId: string,
    actorId: ActorId,
    payment: { id: string; number: number },
    date: string,
    client: DbClient,
  ) {
    return reverse(
      companyId,
      actorId,
      { postingKey: `payment:${payment.id}` },
      {
        postingKey: `payment:${payment.id}:void`,
        date,
        description: `Payment ${formatRecordNumber("payment", payment.number)} voided`,
      },
      client,
    );
  },

  /**
   * Rule E1 — expense approved: Dr the category's expense account / Cr Cash, Bank or — when not paid yet —
   * Accounts Payable. Dated the expense date.
   */
  postExpenseApproved(
    companyId: string,
    actorId: ActorId,
    expense: {
      id: string;
      number: number;
      category: ExpenseCategoryKey;
      amount: { toString(): string };
      paymentMethod: string;
      expenseDate: Date;
      vendor: string | null;
    },
    client: DbClient,
  ) {
    const code = formatRecordNumber("expense", expense.number);
    const creditKey: SystemAccountKey =
      expense.paymentMethod === "UNPAID" ? "payable" : moneyAccountKey(expense.paymentMethod);
    return post(
      companyId,
      actorId,
      {
        type: "EXPENSE",
        date: expense.expenseDate.toISOString().slice(0, 10),
        description: `Expense ${code}${expense.vendor ? ` — ${expense.vendor}` : ""}`,
        reference: code,
        postingKey: `expense:${expense.id}:approve`,
        sourceType: "EXPENSE",
        sourceId: expense.id,
        lines: [
          { account: { systemKey: expenseAccountKey(expense.category) }, debit: money(expense.amount) },
          { account: { systemKey: creditKey }, credit: money(expense.amount) },
        ],
      },
      client,
    );
  },

  /** Rule E2 — an unpaid (on credit) expense is paid: Dr Accounts Payable / Cr Cash or Bank. Dated the payment day. */
  postExpensePaid(
    companyId: string,
    actorId: ActorId,
    expense: { id: string; number: number; amount: { toString(): string }; vendor: string | null },
    payment: { method: string; date: string },
    client: DbClient,
  ) {
    const code = formatRecordNumber("expense", expense.number);
    return post(
      companyId,
      actorId,
      {
        type: "PAYMENT",
        date: payment.date,
        description: `Paid ${code}${expense.vendor ? ` to ${expense.vendor}` : ""}`,
        reference: code,
        postingKey: `expense:${expense.id}:paid`,
        sourceType: "EXPENSE",
        sourceId: expense.id,
        lines: [
          { account: { systemKey: "payable" }, debit: money(expense.amount) },
          { account: { systemKey: moneyAccountKey(payment.method) }, credit: money(expense.amount) },
        ],
      },
      client,
    );
  },

  /**
   * Seed/upgrade helper: gives every company its default accounts and posts invoices and payments that were created
   * before the ledger existed (phase 07 data). Idempotent thanks to posting keys. System action (no user).
   */
  async syncAllCompanies() {
    const companies = await companyRepository.listIds();
    for (const { id: companyId } of companies) {
      await db.$transaction(async (tx) => {
        await ensureAccounts(companyId, tx);
        for (const invoice of await invoiceRepository.listIssuedForLedger(companyId, tx)) {
          await this.postInvoiceIssued(companyId, null, invoice, tx);
          if (invoice.status === "CANCELLED" && invoice.cancelledAt) {
            await this.postInvoiceCancelled(
              companyId,
              null,
              invoice,
              invoice.cancelledAt.toISOString().slice(0, 10),
              tx,
            );
          }
        }
        for (const payment of await paymentRepository.listForLedger(companyId, tx)) {
          await this.postPaymentReceived(companyId, null, payment, tx);
          if (payment.voidedAt) {
            await this.postPaymentVoided(
              companyId,
              null,
              payment,
              payment.voidedAt.toISOString().slice(0, 10),
              tx,
            );
          }
        }
      });
    }
    return companies.length;
  },
};
