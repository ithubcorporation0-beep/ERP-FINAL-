import "server-only";
import {
  ACTIVITY_SOURCES,
  CHART_WIDGETS,
  DASHBOARD_SOURCES,
  KPI_WIDGETS,
  QUICK_ACTIONS,
  type ActivityId,
  type ChartId,
  type DashboardSource,
  type KpiId,
} from "@/config/dashboard";
import { EXPENSE_CATEGORY_LABELS, expenseCategoryLabel } from "@/config/accounting";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import { formatMoney } from "@/lib/format";
import { addMoney, compareMoney, money, subtractMoney, sumMoney } from "@/lib/money";
import { addDays, resolveDateRange, type DateRangePreset, type ResolvedDateRange } from "@/lib/date-range";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hasAnyPermission, hasPermission, type PermissionKey } from "@/lib/permissions";
import { authorize, type TenantContext } from "@/lib/tenant";
import { companyRepository } from "@/server/repositories/company.repository";
import { customerRepository } from "@/server/repositories/customer.repository";
import { employeeRepository } from "@/server/repositories/employee.repository";
import { expenseRepository } from "@/server/repositories/expense.repository";
import { journalRepository } from "@/server/repositories/journal.repository";
import { leaveRepository } from "@/server/repositories/leave.repository";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { paymentRepository } from "@/server/repositories/payment.repository";
import { attendanceService } from "./attendance.service";

/**
 * Dashboard figures. Every number comes from a database query scoped to the current company; a widget whose
 * module does not exist yet reports `unavailable` (never a made-up value), and a widget whose query fails reports
 * `error` (logged) without breaking the rest of the page. Visibility is decided here, on the server, from the
 * user's permissions — see src/config/dashboard.ts.
 */

export type WidgetState<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable"; module: string; phase: number }
  | { status: "error" };

export interface KpiData {
  /** Exact decimal string: a count ("12") or money ("1250.50", never a float). */
  value: string;
  format: "currency" | "number";
  /** How many of `value` were added in the selected range (for running totals such as customers). */
  addedInRange?: number;
}

/** A month-by-month chart. `values` holds one number per series key. */
export interface MonthlyChartData {
  series: Array<{ key: string; label: string; kind: "bar" | "line" }>;
  /** One row per month (key "YYYY-MM") or per category. */
  rows: Array<{ key: string; label: string; values: Record<string, number> }>;
  /** False when every value is zero — the UI shows an empty state instead of a flat chart. */
  hasData: boolean;
}

export interface ActivityItem {
  id: string;
  source: ActivityId;
  title: string;
  /** Preformatted extra, e.g. the amount. */
  detail?: string;
  /** ISO timestamp. */
  at: string;
}

export interface DashboardScope {
  ctx: TenantContext;
  range: ResolvedDateRange;
  currency: string;
  locale: string;
  timeZone: string;
}

const ACTIVITY_LIMIT = 8;

type KpiProvider = (scope: DashboardScope) => Promise<KpiData>;
type ChartProvider = (scope: DashboardScope) => Promise<MonthlyChartData>;
type ActivityProvider = (scope: DashboardScope, limit: number) => Promise<ActivityItem[]>;

// ─── Providers: one per widget whose module exists. Add new ones as modules ship. ───

const kpiProviders: Partial<Record<KpiId, KpiProvider>> = {
  async totalCustomers({ ctx, range }) {
    const [value, addedInRange] = await Promise.all([
      customerRepository.countActive(ctx.companyId),
      customerRepository.countActive(ctx.companyId, { from: range.from, to: range.to }),
    ]);
    return { value: String(value), format: "number", addedInRange };
  },

  /** Revenue = issued invoices (sent, partially paid, paid) dated in the range. Drafts and cancelled don't count. */
  async totalRevenue({ ctx, range }) {
    const total = await invoiceRepository.sumIssued(ctx.companyId, calendarBounds(range));
    return { value: money(total ?? "0"), format: "currency" };
  },

  /** Approved expenses dated in the range. */
  async totalExpenses({ ctx, range }) {
    const total = await expenseRepository.sumApproved(ctx.companyId, calendarBounds(range));
    return { value: money(total ?? "0"), format: "currency" };
  },

  /** From the ledger: revenue − expense accounts for entries dated in the range (same as the P&L report). */
  async netProfit({ ctx, range }) {
    const rows = await journalRepository.monthlyByType(ctx.companyId, calendarBounds(range));
    const totals = profitByMonth(rows);
    return {
      value: sumMoney([...totals.values()].map((month) => subtractMoney(month.revenue, month.expense))),
      format: "currency",
    };
  },

  /** Current workforce (probation, active, on notice); "added" = joined in the range. */
  async totalEmployees({ ctx, range }) {
    const bounds = calendarBounds(range);
    const [value, addedInRange] = await Promise.all([
      employeeRepository.countWorkforce(ctx.companyId),
      employeeRepository.countWorkforce(ctx.companyId, bounds),
    ]);
    return { value: String(value), format: "number", addedInRange };
  },

  /** What customers owe right now on open invoices (not limited to the range). */
  async outstandingInvoices({ ctx }) {
    const { total, paid } = await invoiceRepository.sumOutstanding(ctx.companyId);
    return { value: subtractMoney(money(total ?? "0"), money(paid ?? "0")), format: "currency" };
  },
};

const chartProviders: Partial<Record<ChartId, ChartProvider>> = {
  /** Ledger revenue vs expenses per month (entry date). */
  async revenueVsExpenses({ ctx, range, locale }) {
    const totals = profitByMonth(await journalRepository.monthlyByType(ctx.companyId, calendarBounds(range)));
    const rows = range.months.map((month) => {
      const values = totals.get(month.key);
      // Chart coordinates only — the exact amounts are in the reports.
      return {
        key: month.key,
        label: monthLabel(month.year, month.month, locale),
        values: { revenue: Number(values?.revenue ?? "0"), expenses: Number(values?.expense ?? "0") },
      };
    });
    return {
      series: [
        { key: "revenue", label: "Revenue", kind: "bar" },
        { key: "expenses", label: "Expenses", kind: "bar" },
      ],
      rows,
      hasData: rows.some((row) => row.values.revenue !== 0 || row.values.expenses !== 0),
    };
  },

  /** Approved expenses in the range by category, largest first. */
  async expenseBreakdown({ ctx, range }) {
    const rows = await expenseRepository.approvedBy(ctx.companyId, "category", calendarBounds(range));
    const sorted = rows
      .map((row) => ({ key: row.key ?? "OTHER", total: money(row.total) }))
      .sort((a, b) => compareMoney(b.total, a.total));
    return {
      series: [{ key: "amount", label: "Approved expenses", kind: "bar" }],
      rows: sorted.map((row) => ({
        key: row.key,
        label: expenseCategoryLabel(row.key),
        values: { amount: Number(row.total) },
      })),
      hasData: sorted.length > 0,
    };
  },

  /** Issued invoice totals per month of the invoice date. */
  async monthlySales({ ctx, range, locale }) {
    const monthly = await invoiceRepository.sumIssuedByMonth(ctx.companyId, calendarBounds(range));
    const totals = new Map(monthly.map((row) => [row.month, money(row.total)]));
    const rows = range.months.map((month) => ({
      key: month.key,
      label: monthLabel(month.year, month.month, locale),
      // Chart coordinates only — exact amounts are in the tables and KPIs.
      values: { sales: Number(totals.get(month.key) ?? "0") },
    }));
    return {
      series: [{ key: "sales", label: "Invoiced sales", kind: "bar" }],
      rows,
      hasData: rows.some((row) => row.values.sales !== 0),
    };
  },

  /** Employee-days per month: present (incl. late and half days), late, absent, on leave — working days only. */
  async employeeAttendance({ ctx, range, locale }) {
    const bounds = calendarBounds(range);
    const months = await attendanceService.monthly(ctx, { from: bounds.from, to: addDays(bounds.to, -1) });
    const rows = range.months.map((month) => {
      const totals = months.get(month.key);
      return {
        key: month.key,
        label: monthLabel(month.year, month.month, locale),
        values: {
          present: totals?.present ?? 0,
          late: totals?.late ?? 0,
          absent: totals?.absent ?? 0,
          onLeave: totals?.onLeave ?? 0,
        },
      };
    });
    return {
      series: [
        { key: "present", label: "Present", kind: "bar" },
        { key: "late", label: "Late", kind: "bar" },
        { key: "absent", label: "Absent", kind: "bar" },
        { key: "onLeave", label: "On leave", kind: "bar" },
      ],
      rows,
      hasData: rows.some((row) => Object.values(row.values).some((value) => value > 0)),
    };
  },

  async customerGrowth({ ctx, range, locale, timeZone }) {
    const [before, monthly] = await Promise.all([
      customerRepository.countActive(ctx.companyId, { to: range.from }),
      customerRepository.countCreatedByMonth(ctx.companyId, { from: range.from, to: range.to, timeZone }),
    ]);
    const added = new Map(monthly.map((row) => [row.month, row.count]));
    let total = before;
    const rows = range.months.map((month) => {
      const count = added.get(month.key) ?? 0;
      total += count;
      return {
        key: month.key,
        label: monthLabel(month.year, month.month, locale),
        values: { added: count, total },
      };
    });
    return {
      series: [
        { key: "added", label: "New customers", kind: "bar" },
        { key: "total", label: "Total customers", kind: "line" },
      ],
      rows,
      hasData: total > 0,
    };
  },
};

const activityProviders: Partial<Record<ActivityId, ActivityProvider>> = {
  async expenses({ ctx, locale }, limit) {
    const expenses = await expenseRepository.listRecent(ctx.companyId, limit);
    return expenses.map((expense) => ({
      id: `expense:${expense.id}`,
      source: "expenses",
      title: `${formatRecordNumber("expense", expense.number)} · ${expense.vendor ?? EXPENSE_CATEGORY_LABELS[expense.category]}`,
      detail: formatMoney(money(expense.amount), { locale, currency: expense.currency }) ?? undefined,
      at: expense.createdAt.toISOString(),
    }));
  },

  async newInvoices({ ctx, locale }, limit) {
    const invoices = await invoiceRepository.listRecent(ctx.companyId, limit);
    return invoices.map((invoice) => ({
      id: `invoice:${invoice.id}`,
      source: "newInvoices",
      title: `${invoice.code} · ${invoice.customer.name}`,
      detail: formatMoney(money(invoice.total), { locale, currency: invoice.currency }) ?? undefined,
      at: invoice.createdAt.toISOString(),
    }));
  },

  async payments({ ctx, locale }, limit) {
    const payments = await paymentRepository.listRecent(ctx.companyId, limit);
    return payments.map((payment) => ({
      id: `payment:${payment.id}`,
      source: "payments",
      title: `${formatRecordNumber("payment", payment.number)} · ${payment.customer.name} (${payment.invoice.code})`,
      detail: formatMoney(money(payment.amount), { locale, currency: payment.invoice.currency }) ?? undefined,
      at: payment.createdAt.toISOString(),
    }));
  },

  /** New employees and leave requests. */
  async employeeActivity({ ctx }, limit) {
    const [employees, leaves] = await Promise.all([
      employeeRepository.listRecent(ctx.companyId, limit),
      leaveRepository.listRecent(ctx.companyId, limit),
    ]);
    return [
      ...employees.map((employee) => ({
        id: `employee:${employee.id}`,
        source: "employeeActivity" as const,
        title: `${formatRecordNumber("employee", employee.number)} · ${employee.name} joined${
          employee.position ? ` as ${employee.position}` : ""
        }`,
        at: employee.createdAt.toISOString(),
      })),
      ...leaves.map((leave) => ({
        id: `leave:${leave.id}`,
        source: "employeeActivity" as const,
        title: `${formatRecordNumber("leave", leave.number)} · ${leave.employee.name}: ${LEAVE_TYPE_LABELS[leave.type]}`,
        detail: `${leave.days} ${leave.days === 1 ? "day" : "days"} · ${LEAVE_STATUS_LABELS[leave.status]}`,
        at: leave.createdAt.toISOString(),
      })),
    ];
  },

  async newCustomers({ ctx }, limit) {
    const customers = await customerRepository.listRecent(ctx.companyId, limit);
    return customers.map((customer) => ({
      id: `customer:${customer.id}`,
      source: "newCustomers",
      title: customer.name,
      at: customer.createdAt.toISOString(),
    }));
  },
};

// ─── Helpers ───

/** Revenue and expense per month from ledger rows (revenue = credit − debit, expense = debit − credit). */
function profitByMonth(rows: ReadonlyArray<{ month: string; type: string; debit: string; credit: string }>) {
  const months = new Map<string, { revenue: string; expense: string }>();
  for (const row of rows) {
    const month = months.get(row.month) ?? { revenue: "0.00", expense: "0.00" };
    if (row.type === "REVENUE")
      month.revenue = addMoney(month.revenue, subtractMoney(money(row.credit), money(row.debit)));
    if (row.type === "EXPENSE")
      month.expense = addMoney(month.expense, subtractMoney(money(row.debit), money(row.credit)));
    months.set(row.month, month);
  }
  return months;
}

/** The range as calendar dates for DATE columns: first day of the first month, first day after the last. */
function calendarBounds(range: ResolvedDateRange): { from: string; to: string } {
  const first = range.months[0];
  const last = range.months.at(-1);
  if (!first || !last) throw new Error("Empty date range");
  const next =
    last.month === 12 ? { year: last.year + 1, month: 1 } : { year: last.year, month: last.month + 1 };
  return { from: `${first.key}-01`, to: `${next.year}-${String(next.month).padStart(2, "0")}-01` };
}

function monthLabel(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function unavailable(source: DashboardSource): { status: "unavailable"; module: string; phase: number } {
  const { label, phase } = DASHBOARD_SOURCES[source];
  return { status: "unavailable", module: label, phase };
}

/** Runs one widget's query. A failure is logged and shown on that widget only. */
async function settle<T>(
  widget: string,
  ctx: TenantContext,
  load: () => Promise<T>,
): Promise<{ status: "ready"; data: T } | { status: "error" }> {
  try {
    return { status: "ready", data: await load() };
  } catch (error) {
    logger.error("Dashboard widget failed to load", { widget, companyId: ctx.companyId, error });
    return { status: "error" };
  }
}

function visible<T extends { permissions: readonly PermissionKey[] }>(
  ctx: TenantContext,
  widgets: readonly T[],
): T[] {
  return widgets.filter((widget) => hasAnyPermission(ctx.permissions, widget.permissions));
}

// ─── Public API ───

export const dashboardService = {
  /** Which widgets this user may see. Nothing else is loaded for them. */
  layout(ctx: TenantContext) {
    authorize(ctx, "dashboard:view");
    return {
      kpis: visible(ctx, KPI_WIDGETS),
      charts: visible(ctx, CHART_WIDGETS),
      activity: visible(ctx, ACTIVITY_SOURCES),
      quickActions: QUICK_ACTIONS.filter((action) => hasPermission(ctx.permissions, action.permission)).map(
        (action) => ({ ...action, module: DASHBOARD_SOURCES[action.source].label }),
      ),
    };
  },

  /** Company formatting settings and the selected date range, resolved in the company's time zone. */
  async scope(ctx: TenantContext, preset: DateRangePreset, now = new Date()): Promise<DashboardScope> {
    authorize(ctx, "dashboard:view");
    const company = await companyRepository.findProfile(ctx.companyId);
    if (!company) throw new NotFoundError("Company");
    return {
      ctx,
      currency: company.baseCurrency,
      locale: company.locale,
      timeZone: company.timezone,
      range: resolveDateRange(preset, {
        timeZone: company.timezone,
        fiscalYearStartMonth: company.fiscalYearStartMonth,
        now,
      }),
    };
  },

  async kpis(
    scope: DashboardScope,
  ): Promise<Array<{ id: KpiId; label: string; state: WidgetState<KpiData> }>> {
    return Promise.all(
      this.layout(scope.ctx).kpis.map(async (widget) => {
        const provider = kpiProviders[widget.id];
        const state = provider
          ? await settle(widget.id, scope.ctx, () => provider(scope))
          : unavailable(widget.source);
        return { id: widget.id, label: widget.label, state };
      }),
    );
  },

  async charts(
    scope: DashboardScope,
  ): Promise<
    Array<{ id: ChartId; label: string; description?: string; state: WidgetState<MonthlyChartData> }>
  > {
    return Promise.all(
      this.layout(scope.ctx).charts.map(async (widget) => {
        const provider = chartProviders[widget.id];
        const state = provider
          ? await settle(widget.id, scope.ctx, () => provider(scope))
          : unavailable(widget.source);
        return { id: widget.id, label: widget.label, description: widget.description, state };
      }),
    );
  },

  /** Latest events across the modules the user may see, newest first. */
  async activity(scope: DashboardScope) {
    const sources = this.layout(scope.ctx).activity;
    const results = await Promise.all(
      sources.map(async (source) => {
        const provider = activityProviders[source.id];
        const state = provider
          ? await settle(source.id, scope.ctx, () => provider(scope, ACTIVITY_LIMIT))
          : unavailable(source.source);
        return { id: source.id, label: source.label, state };
      }),
    );
    const items = results
      .flatMap((result) => (result.state.status === "ready" ? result.state.data : []))
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, ACTIVITY_LIMIT);
    return {
      items,
      tracked: results
        .filter((result) => result.state.status === "ready")
        .map(({ id, label }) => ({ id, label })),
      unavailable: results.flatMap(({ id, label, state }) =>
        state.status === "unavailable" ? [{ id, label, module: state.module, phase: state.phase }] : [],
      ),
      failed: results
        .filter((result) => result.state.status === "error")
        .map(({ id, label }) => ({ id, label })),
    };
  },
};
