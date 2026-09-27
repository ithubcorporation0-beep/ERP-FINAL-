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
import { resolveDateRange, type DateRangePreset, type ResolvedDateRange } from "@/lib/date-range";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { hasAnyPermission, hasPermission, type PermissionKey } from "@/lib/permissions";
import { authorize, type TenantContext } from "@/lib/tenant";
import { companyRepository } from "@/server/repositories/company.repository";
import { customerRepository } from "@/server/repositories/customer.repository";

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
  value: number;
  format: "currency" | "number";
  /** How many of `value` were added in the selected range (for running totals such as customers). */
  addedInRange?: number;
}

/** A month-by-month chart. `values` holds one number per series key. */
export interface MonthlyChartData {
  series: Array<{ key: string; label: string; kind: "bar" | "line" }>;
  rows: Array<{ month: string; label: string; values: Record<string, number> }>;
  /** False when every value is zero — the UI shows an empty state instead of a flat chart. */
  hasData: boolean;
}

export interface ActivityItem {
  id: string;
  source: ActivityId;
  title: string;
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
    return { value, format: "number", addedInRange };
  },
};

const chartProviders: Partial<Record<ChartId, ChartProvider>> = {
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
        month: month.key,
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
