import "server-only";
import {
  expenseCategoryLabel,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPES,
  type AccountTypeKey,
} from "@/config/accounting";
import { formatRecordNumber } from "@/config/records";
import { PAYMENT_METHOD_LABELS } from "@/config/sales";
import {
  addTo,
  agingBucket,
  AGING_BUCKETS,
  daysBetween,
  normalBalance,
  type AgingBucket,
} from "@/lib/accounting";
import { addDays, dateToDateOnly, type DateRangePreset } from "@/lib/date-range";
import { addMoney, compareMoney, money, subtractMoney, sumMoney, toCents } from "@/lib/money";
import { authorize, type TenantContext } from "@/lib/tenant";
import { accountRepository } from "@/server/repositories/account.repository";
import { customerRepository } from "@/server/repositories/customer.repository";
import { expenseRepository } from "@/server/repositories/expense.repository";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { journalRepository } from "@/server/repositories/journal.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { ledgerService } from "./ledger.service";
import { periodBounds, salesContext } from "./sales-shared";

/**
 * Financial reports. Profit & Loss, Balance Sheet and Cash Flow are computed from the ledger (journal lines);
 * the receivable/payable agings and the expense/revenue reports come from the invoices, payments and expenses
 * tables (the sub-ledgers), with the matching ledger balance shown for reconciliation. All sums are exact
 * (src/lib/money.ts). What each report does and does not cover is documented in docs/accounting.md.
 */

export interface ReportRow {
  label: string;
  amount: string;
  /** Account code, category, etc. */
  detail?: string;
}

async function accountTotals(ctx: TenantContext, dates: { from?: string; to?: string }) {
  await ledgerService.ensureAccounts(ctx.companyId);
  const [accounts, totals] = await Promise.all([
    accountRepository.list(ctx.companyId),
    journalRepository.totalsByAccount(ctx.companyId, dates),
  ]);
  const byAccount = new Map(totals.map((row) => [row.accountId, row]));
  return accounts.map((account) => {
    const total = byAccount.get(account.id);
    return {
      ...account,
      balance: normalBalance(account.type, total?.debit ?? "0", total?.credit ?? "0"),
    };
  });
}

function rowsOf(accounts: Awaited<ReturnType<typeof accountTotals>>, type: AccountTypeKey): ReportRow[] {
  return accounts
    .filter((account) => account.type === type && compareMoney(account.balance, "0.00") !== 0)
    .map((account) => ({ label: account.name, detail: account.code, amount: account.balance }));
}

const total = (rows: readonly ReportRow[]) => sumMoney(rows.map((row) => row.amount));

/** Share of `part` in `whole` as a percentage with one decimal, computed exactly ("12.5"). */
function share(part: string, whole: string): string {
  const w = toCents(whole);
  if (w === 0n) return "0.0";
  const tenths = (toCents(part) * 1000n + w / 2n) / w;
  return `${tenths / 10n}.${tenths % 10n}`;
}

export const financialReportService = {
  /** Revenue and expense accounts for the period; net profit = revenue − expenses. */
  async profitAndLoss(ctx: TenantContext, preset: DateRangePreset) {
    authorize(ctx, "accounting:view");
    const period = await periodBounds(ctx, preset);
    const accounts = await accountTotals(ctx, period);
    const revenue = rowsOf(accounts, "REVENUE");
    const expenses = rowsOf(accounts, "EXPENSE");
    const totalRevenue = total(revenue);
    const totalExpenses = total(expenses);
    return {
      period,
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netProfit: subtractMoney(totalRevenue, totalExpenses),
    };
  },

  /**
   * Balances at the end of `asOf`. Profit not yet closed into equity is shown as "Current earnings", so the sheet
   * balances as long as every entry does: assets = liabilities + equity.
   */
  async balanceSheet(ctx: TenantContext, asOf?: string) {
    authorize(ctx, "accounting:view");
    const { today } = await salesContext(ctx);
    const date = asOf ?? today;
    const accounts = await accountTotals(ctx, { to: addDays(date, 1) });
    const assets = rowsOf(accounts, "ASSET");
    const liabilities = rowsOf(accounts, "LIABILITY");
    const equity = rowsOf(accounts, "EQUITY");
    const earnings = subtractMoney(total(rowsOf(accounts, "REVENUE")), total(rowsOf(accounts, "EXPENSE")));
    if (compareMoney(earnings, "0.00") !== 0) {
      equity.push({ label: "Current earnings (profit not yet closed to equity)", amount: earnings });
    }
    const totalAssets = total(assets);
    const totalLiabilities = total(liabilities);
    const totalEquity = total(equity);
    const liabilitiesAndEquity = addMoney(totalLiabilities, totalEquity);
    return {
      asOf: date,
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      liabilitiesAndEquity,
      balanced: compareMoney(totalAssets, liabilitiesAndEquity) === 0,
    };
  },

  /**
   * Movements of the Cash and Bank accounts in the period, grouped by transaction type (direct method, simplified:
   * no operating/investing/financing split). Closing = opening + money in − money out.
   */
  async cashFlow(ctx: TenantContext, preset: DateRangePreset) {
    authorize(ctx, "accounting:view");
    const period = await periodBounds(ctx, preset);
    await ledgerService.ensureAccounts(ctx.companyId);
    const cashAccounts = await accountRepository.findSystem(ctx.companyId, ["cash", "bank"]);
    const ids = cashAccounts.map((account) => account.id);
    const [openingTotals, movements] = await Promise.all([
      journalRepository.totalsByAccount(ctx.companyId, { to: period.from }),
      journalRepository.totalsByTypeForAccounts(ctx.companyId, ids, period),
    ]);
    const opening = sumMoney(
      openingTotals
        .filter((row) => ids.includes(row.accountId))
        .map((row) => normalBalance("ASSET", row.debit, row.credit)),
    );
    const inflows = new Map<string, string>();
    const outflows = new Map<string, string>();
    for (const line of movements) {
      addTo(inflows, line.type, line.debit);
      addTo(outflows, line.type, line.credit);
    }
    const byType = TRANSACTION_TYPES.filter((type) => inflows.has(type) || outflows.has(type)).map(
      (type) => ({
        type,
        label: TRANSACTION_TYPE_LABELS[type],
        moneyIn: money(inflows.get(type) ?? "0"),
        moneyOut: money(outflows.get(type) ?? "0"),
      }),
    );
    const totalIn = sumMoney(byType.map((row) => row.moneyIn));
    const totalOut = sumMoney(byType.map((row) => row.moneyOut));
    return {
      period,
      accounts: cashAccounts.map((account) => account.name),
      opening,
      byType,
      totalIn,
      totalOut,
      netChange: subtractMoney(totalIn, totalOut),
      closing: subtractMoney(addMoney(opening, totalIn), totalOut),
    };
  },

  /** Open invoices by age of their due date, and the Accounts Receivable ledger balance to reconcile with. */
  async receivables(ctx: TenantContext) {
    authorize(ctx, "accounting:view");
    const { today } = await salesContext(ctx);
    const [invoices, accounts] = await Promise.all([
      invoiceRepository.listOpen(ctx.companyId),
      accountTotals(ctx, {}),
    ]);
    const buckets = new Map<string, string>();
    const items = invoices.map((invoice) => {
      const dueDate = dateToDateOnly(invoice.dueDate);
      const balance = subtractMoney(money(invoice.total), money(invoice.amountPaid));
      const bucket = agingBucket(dueDate, today);
      addTo(buckets, bucket, balance);
      return {
        id: invoice.id,
        code: invoice.code,
        customer: invoice.customer.name,
        dueDate,
        daysOverdue: Math.max(0, daysBetween(dueDate, today)),
        bucket,
        balance,
      };
    });
    const ledger = accounts.find((account) => account.systemKey === "receivable")?.balance ?? "0.00";
    const totalOpen = sumMoney(items.map((item) => item.balance));
    return {
      asOf: today,
      items,
      buckets: AGING_BUCKETS.map((bucket) => ({ bucket, amount: money(buckets.get(bucket) ?? "0") })),
      total: totalOpen,
      ledgerBalance: ledger,
      reconciled: compareMoney(totalOpen, ledger) === 0,
    };
  },

  /**
   * Approved expenses bought on credit and not paid yet, by age since the expense date (they are treated as due
   * immediately — vendor payment terms aren't recorded), and the Accounts Payable ledger balance.
   */
  async payables(ctx: TenantContext) {
    authorize(ctx, "accounting:view");
    const { today } = await salesContext(ctx);
    const [expenses, accounts] = await Promise.all([
      expenseRepository.listUnpaid(ctx.companyId),
      accountTotals(ctx, {}),
    ]);
    const buckets = new Map<string, string>();
    const items = expenses.map((expense) => {
      const date = dateToDateOnly(expense.expenseDate);
      const bucket: AgingBucket = agingBucket(date, today);
      addTo(buckets, bucket, money(expense.amount));
      return {
        id: expense.id,
        code: formatRecordNumber("expense", expense.number),
        vendor: expense.vendor ?? "—",
        date,
        daysOutstanding: Math.max(0, daysBetween(date, today)),
        bucket,
        amount: money(expense.amount),
      };
    });
    const ledger = accounts.find((account) => account.systemKey === "payable")?.balance ?? "0.00";
    const totalOpen = sumMoney(items.map((item) => item.amount));
    return {
      asOf: today,
      items,
      buckets: AGING_BUCKETS.map((bucket) => ({ bucket, amount: money(buckets.get(bucket) ?? "0") })),
      total: totalOpen,
      ledgerBalance: ledger,
      reconciled: compareMoney(totalOpen, ledger) === 0,
    };
  },

  /** Approved expenses in the period by category (with share of total) and by vendor. */
  async expenses(ctx: TenantContext, preset: DateRangePreset) {
    authorize(ctx, "accounting:view");
    const period = await periodBounds(ctx, preset);
    const [byCategory, byVendor] = await Promise.all([
      expenseRepository.approvedBy(ctx.companyId, "category", period),
      expenseRepository.approvedBy(ctx.companyId, "vendor", period),
    ]);
    const grand = sumMoney(byCategory.map((row) => money(row.total)));
    const sortDesc = <T extends { amount: string }>(rows: T[]) =>
      rows.sort((a, b) => compareMoney(b.amount, a.amount));
    return {
      period,
      total: grand,
      byCategory: sortDesc(
        byCategory.map((row) => ({
          label: expenseCategoryLabel(row.key),
          amount: money(row.total),
          count: row.count,
          share: share(money(row.total), grand),
        })),
      ),
      byVendor: sortDesc(
        byVendor.map((row) => ({
          label: row.key ?? "No vendor",
          amount: money(row.total),
          count: row.count,
        })),
      ).slice(0, 20),
    };
  },

  /** Invoiced revenue (issued invoices, incl. tax) by month and customer, and cash received by method. */
  async revenue(ctx: TenantContext, preset: DateRangePreset) {
    authorize(ctx, "accounting:view");
    const period = await periodBounds(ctx, preset);
    const [monthly, byCustomer, received] = await Promise.all([
      invoiceRepository.sumIssuedByMonth(ctx.companyId, period),
      invoiceRepository.sumIssuedByCustomer(ctx.companyId, period),
      paymentRepository.sumReceivedByMethod(ctx.companyId, period),
    ]);
    const names = new Map(
      (
        await customerRepository.namesByIds(
          ctx.companyId,
          byCustomer.map((row) => row.customerId),
        )
      ).map((row) => [row.id, row.name]),
    );
    const invoiced = sumMoney(monthly.map((row) => money(row.total)));
    return {
      period,
      invoiced,
      byMonth: monthly.map((row) => ({ label: row.month, amount: money(row.total) })),
      byCustomer: byCustomer
        .map((row) => ({
          label: names.get(row.customerId) ?? "Unknown",
          amount: money(row.total),
          count: row.count,
          share: share(money(row.total), invoiced),
        }))
        .sort((a, b) => compareMoney(b.amount, a.amount))
        .slice(0, 20),
      received: received.map((row) => ({
        label: PAYMENT_METHOD_LABELS[row.method],
        amount: money(row.total),
        count: row.count,
      })),
      totalReceived: sumMoney(received.map((row) => money(row.total))),
    };
  },
};
