import type { Metadata } from "next";
import { Suspense } from "react";
import { LayoutDashboard } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ActivityFeed, ActivityFeedSkeleton } from "@/features/dashboard/activity-feed";
import { ChartGrid, ChartGridSkeleton } from "@/features/dashboard/chart-grid";
import { KpiGrid, KpiGridSkeleton } from "@/features/dashboard/kpi-grid";
import { QuickActions } from "@/features/dashboard/quick-actions";
import { RangeFilter } from "@/features/dashboard/range-filter";
import { authorizePage } from "@/lib/auth/page";
import { DATE_RANGE_LABELS } from "@/lib/date-range";
import { dashboardQuerySchema } from "@/lib/validation";
import { dashboardService, type DashboardScope } from "@/server/services/dashboard.service";

export const metadata: Metadata = { title: "Dashboard" };

async function KpiSection({ scope }: { scope: DashboardScope }) {
  const kpis = await dashboardService.kpis(scope);
  return (
    <KpiGrid
      kpis={kpis}
      currency={scope.currency}
      locale={scope.locale}
      rangeLabel={DATE_RANGE_LABELS[scope.range.preset]}
    />
  );
}

async function ChartSection({ scope }: { scope: DashboardScope }) {
  const charts = await dashboardService.charts(scope);
  return (
    <ChartGrid charts={charts} locale={scope.locale} rangeLabel={DATE_RANGE_LABELS[scope.range.preset]} />
  );
}

async function ActivitySection({ scope }: { scope: DashboardScope }) {
  const activity = await dashboardService.activity(scope);
  return <ActivityFeed {...activity} locale={scope.locale} timeZone={scope.timeZone} />;
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  // Server-side check: hiding the menu link is not protection.
  const ctx = await authorizePage("dashboard:view");
  if (!ctx) return <AccessDenied />;

  const { range } = dashboardQuerySchema.parse(await searchParams);
  const layout = dashboardService.layout(ctx);
  const scope = await dashboardService.scope(ctx, range);
  const hasWidgets =
    layout.kpis.length + layout.charts.length + layout.activity.length + layout.quickActions.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Key figures and activity across your company."
        actions={hasWidgets ? <RangeFilter value={range} /> : undefined}
      />

      {!hasWidgets ? (
        <EmptyState
          icon={LayoutDashboard}
          title="Nothing to show yet"
          description="Your role doesn't include any dashboard figures. Ask an administrator if you need access."
        />
      ) : null}

      {layout.kpis.length > 0 ? (
        <Suspense key={`kpis-${range}`} fallback={<KpiGridSkeleton count={layout.kpis.length} />}>
          <KpiSection scope={scope} />
        </Suspense>
      ) : null}

      {layout.charts.length > 0 ? (
        <Suspense key={`charts-${range}`} fallback={<ChartGridSkeleton count={layout.charts.length} />}>
          <ChartSection scope={scope} />
        </Suspense>
      ) : null}

      {layout.activity.length > 0 || layout.quickActions.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {layout.activity.length > 0 ? (
            <Suspense fallback={<ActivityFeedSkeleton />}>
              <ActivitySection scope={scope} />
            </Suspense>
          ) : null}
          {layout.quickActions.length > 0 ? <QuickActions actions={layout.quickActions} /> : null}
        </div>
      ) : null}
    </div>
  );
}
