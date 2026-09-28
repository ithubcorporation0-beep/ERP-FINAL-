import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FINANCIAL_REPORTS, type FinancialReportSlug } from "@/config/accounting";
import { RangeFilter } from "@/features/dashboard/range-filter";
import { Figures, MoneySection, ReconciliationNote, type MoneyFormat } from "@/features/finance/report-views";
import { AGING_LABELS } from "@/lib/accounting";
import { authorizePage } from "@/lib/auth/page";
import type { DateRangePreset } from "@/lib/date-range";
import { compareMoney } from "@/lib/money";
import type { TenantContext } from "@/lib/tenant";
import { reportQuerySchema } from "@/lib/validation";
import { financialReportService } from "@/server/services/financial-report.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Financial report" };

interface ReportArgs {
  ctx: TenantContext;
  range: DateRangePreset;
  asOf?: string;
  format: MoneyFormat;
}

function Period({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">Period: {label} (by transaction date).</p>;
}

async function ProfitAndLoss({ ctx, range, format }: ReportArgs) {
  const report = await financialReportService.profitAndLoss(ctx, range);
  const loss = compareMoney(report.netProfit, "0.00") < 0;
  return (
    <>
      <Period label={report.period.label} />
      <Figures
        format={format}
        items={[
          { label: "Revenue", amount: report.totalRevenue },
          { label: "Expenses", amount: report.totalExpenses },
          {
            label: loss ? "Net loss" : "Net profit",
            amount: report.netProfit,
            tone: loss ? "danger" : "success",
          },
        ]}
      />
      <MoneySection
        title="Revenue"
        rows={report.revenue}
        detailHeader="Account"
        total={report.totalRevenue}
        totalLabel="Total revenue"
        format={format}
      />
      <MoneySection
        title="Expenses"
        rows={report.expenses}
        detailHeader="Account"
        total={report.totalExpenses}
        totalLabel="Total expenses"
        format={format}
      />
    </>
  );
}

async function BalanceSheet({ ctx, asOf, format }: ReportArgs) {
  const report = await financialReportService.balanceSheet(ctx, asOf);
  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="asOf">As of</Label>
          <Input id="asOf" name="asOf" type="date" defaultValue={report.asOf} className="w-44" />
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>
      <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
        <StatusBadge tone={report.balanced ? "success" : "danger"}>
          {report.balanced ? "Balanced" : "Not balanced"}
        </StatusBadge>
        Assets = Liabilities + Equity at the end of {report.asOf}.
      </p>
      <Figures
        format={format}
        items={[
          { label: "Total assets", amount: report.totalAssets },
          { label: "Total liabilities", amount: report.totalLiabilities },
          { label: "Total equity", amount: report.totalEquity },
          { label: "Liabilities + equity", amount: report.liabilitiesAndEquity },
        ]}
      />
      <MoneySection
        title="Assets"
        rows={report.assets}
        detailHeader="Account"
        total={report.totalAssets}
        empty="No balances."
        format={format}
      />
      <MoneySection
        title="Liabilities"
        rows={report.liabilities}
        detailHeader="Account"
        total={report.totalLiabilities}
        empty="No balances."
        format={format}
      />
      <MoneySection
        title="Equity"
        rows={report.equity}
        detailHeader="Account"
        total={report.totalEquity}
        empty="No balances."
        format={format}
      />
    </>
  );
}

async function CashFlow({ ctx, range, format }: ReportArgs) {
  const report = await financialReportService.cashFlow(ctx, range);
  return (
    <>
      <Period label={report.period.label} />
      <p className="text-sm text-muted-foreground">Accounts: {report.accounts.join(", ")}.</p>
      <Figures
        format={format}
        items={[
          { label: "Opening balance", amount: report.opening },
          { label: "Money in", amount: report.totalIn, tone: "success" },
          { label: "Money out", amount: report.totalOut, tone: "danger" },
          { label: "Closing balance", amount: report.closing },
        ]}
      />
      <MoneySection
        title="Money in"
        rows={report.byType
          .filter((row) => compareMoney(row.moneyIn, "0.00") !== 0)
          .map((row) => ({ key: row.type, label: row.label, amount: row.moneyIn }))}
        total={report.totalIn}
        format={format}
      />
      <MoneySection
        title="Money out"
        rows={report.byType
          .filter((row) => compareMoney(row.moneyOut, "0.00") !== 0)
          .map((row) => ({ key: row.type, label: row.label, amount: row.moneyOut }))}
        total={report.totalOut}
        format={format}
      />
    </>
  );
}

async function Receivables({ ctx, format }: ReportArgs) {
  const report = await financialReportService.receivables(ctx);
  return (
    <>
      <p className="text-sm text-muted-foreground">Open invoices as of {report.asOf}, aged by due date.</p>
      <ReconciliationNote
        ok={report.reconciled}
        account="Accounts Receivable"
        ledgerBalance={report.ledgerBalance}
        format={format}
      />
      <MoneySection
        title="Aging"
        rows={report.buckets.map((row) => ({
          key: row.bucket,
          label: AGING_LABELS[row.bucket],
          amount: row.amount,
        }))}
        total={report.total}
        totalLabel="Total receivable"
        format={format}
      />
      <MoneySection
        title="Open invoices"
        rows={report.items.map((item) => ({
          key: item.id,
          label: `${item.code} — ${item.customer}`,
          detail: `Due ${item.dueDate}${item.daysOverdue > 0 ? ` · ${item.daysOverdue} days overdue` : ""}`,
          amount: item.balance,
          href: `/sales/invoices/${item.id}`,
        }))}
        detailHeader="Due"
        empty="No open invoices."
        format={format}
      />
    </>
  );
}

async function Payables({ ctx, format }: ReportArgs) {
  const report = await financialReportService.payables(ctx);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Approved expenses not paid yet as of {report.asOf}, aged from the expense date (vendor payment terms
        aren&apos;t recorded, so they count as due immediately).
      </p>
      <ReconciliationNote
        ok={report.reconciled}
        account="Accounts Payable"
        ledgerBalance={report.ledgerBalance}
        format={format}
      />
      <MoneySection
        title="Aging"
        rows={report.buckets.map((row) => ({
          key: row.bucket,
          label: AGING_LABELS[row.bucket],
          amount: row.amount,
        }))}
        total={report.total}
        totalLabel="Total payable"
        format={format}
      />
      <MoneySection
        title="Unpaid expenses"
        rows={report.items.map((item) => ({
          key: item.id,
          label: `${item.code} — ${item.vendor}`,
          detail: `${item.date} · ${item.daysOutstanding} days`,
          amount: item.amount,
          href: `/finance/expenses/${item.id}`,
        }))}
        detailHeader="Date"
        empty="Nothing owed to vendors."
        format={format}
      />
    </>
  );
}

async function Expenses({ ctx, range, format }: ReportArgs) {
  const report = await financialReportService.expenses(ctx, range);
  return (
    <>
      <Period label={report.period.label} />
      <p className="text-sm text-muted-foreground">
        Approved expenses only (pending and rejected are excluded).
      </p>
      <Figures format={format} items={[{ label: "Total approved expenses", amount: report.total }]} />
      <MoneySection
        title="By category"
        rows={report.byCategory.map((row) => ({
          label: row.label,
          detail: `${row.share}% · ${row.count} ${row.count === 1 ? "expense" : "expenses"}`,
          amount: row.amount,
        }))}
        detailHeader="Share"
        total={report.total}
        format={format}
      />
      <MoneySection
        title="Top vendors"
        rows={report.byVendor.map((row) => ({
          label: row.label,
          detail: `${row.count} ${row.count === 1 ? "expense" : "expenses"}`,
          amount: row.amount,
        }))}
        detailHeader="Count"
        format={format}
      />
    </>
  );
}

async function Revenue({ ctx, range, format }: ReportArgs) {
  const report = await financialReportService.revenue(ctx, range);
  return (
    <>
      <Period label={report.period.label} />
      <p className="text-sm text-muted-foreground">
        Invoiced = issued invoices (including tax) by invoice date. Received = payments by payment date.
      </p>
      <Figures
        format={format}
        items={[
          { label: "Invoiced", amount: report.invoiced },
          { label: "Cash received", amount: report.totalReceived, tone: "success" },
        ]}
      />
      <MoneySection title="Invoiced by month" rows={report.byMonth} total={report.invoiced} format={format} />
      <MoneySection
        title="Top customers"
        rows={report.byCustomer.map((row) => ({
          label: row.label,
          detail: `${row.share}% · ${row.count} ${row.count === 1 ? "invoice" : "invoices"}`,
          amount: row.amount,
        }))}
        detailHeader="Share"
        format={format}
      />
      <MoneySection
        title="Received by method"
        rows={report.received.map((row) => ({
          label: row.label,
          detail: `${row.count} ${row.count === 1 ? "payment" : "payments"}`,
          amount: row.amount,
        }))}
        detailHeader="Count"
        total={report.totalReceived}
        format={format}
      />
    </>
  );
}

const REPORTS: Record<
  FinancialReportSlug,
  { view: (args: ReportArgs) => Promise<React.ReactNode>; ranged: boolean }
> = {
  "profit-and-loss": { view: ProfitAndLoss, ranged: true },
  "balance-sheet": { view: BalanceSheet, ranged: false },
  "cash-flow": { view: CashFlow, ranged: true },
  "accounts-receivable": { view: Receivables, ranged: false },
  "accounts-payable": { view: Payables, ranged: false },
  expenses: { view: Expenses, ranged: true },
  revenue: { view: Revenue, ranged: true },
};

export default async function FinancialReportPage({
  params,
  searchParams,
}: PageProps<"/finance/reports/[report]">) {
  const ctx = await authorizePage("accounting:view");
  if (!ctx) return <AccessDenied />;
  const slug = (await params).report;
  const meta = FINANCIAL_REPORTS.find((report) => report.slug === slug);
  if (!meta) notFound();
  const { range, asOf } = reportQuerySchema.parse(await searchParams);
  const sales = await salesContext(ctx);
  const report = REPORTS[meta.slug];

  return (
    <>
      <PageHeader
        title={meta.label}
        description={meta.description}
        actions={report.ranged ? <RangeFilter value={range} /> : undefined}
      />
      <p className="mb-4 text-sm">
        <Link href="/finance/reports" className="text-primary hover:underline">
          ← All financial reports
        </Link>
      </p>
      <div className="space-y-4">
        {await report.view({ ctx, range, asOf, format: { locale: sales.locale, currency: sales.currency } })}
      </div>
    </>
  );
}
