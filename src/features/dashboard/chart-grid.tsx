import { ChartColumn } from "lucide-react";
import type { ChartId } from "@/config/dashboard";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MonthlyChartData, WidgetState } from "@/server/services/dashboard.service";
import { MonthlyChart } from "./monthly-chart";
import { UnavailableNote, WidgetError } from "./widget-states";

export interface ChartWidget {
  id: ChartId;
  label: string;
  description?: string;
  state: WidgetState<MonthlyChartData>;
}

const GRID = "grid gap-4 lg:grid-cols-2";

function ChartBody({
  widget,
  locale,
  rangeLabel,
}: {
  widget: ChartWidget;
  locale: string;
  rangeLabel: string;
}) {
  const { state } = widget;
  if (state.status === "error") return <WidgetError label={widget.label} />;
  if (state.status === "unavailable") {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 text-center">
        <ChartColumn className="size-6 text-muted-foreground" aria-hidden="true" />
        <UnavailableNote module={state.module} phase={state.phase} />
      </div>
    );
  }
  if (!state.data.hasData) {
    return (
      <EmptyState
        size="compact"
        icon={ChartColumn}
        title="No data for this period"
        description={`Nothing recorded in: ${rangeLabel.toLowerCase()}.`}
        className="h-64 justify-center"
      />
    );
  }
  return <MonthlyChart data={state.data} title={widget.label} locale={locale} />;
}

export function ChartGrid({
  charts,
  locale,
  rangeLabel,
}: {
  charts: ChartWidget[];
  locale: string;
  rangeLabel: string;
}) {
  return (
    <section aria-label="Charts" className={GRID}>
      {charts.map((widget) => (
        <Card key={widget.id} className="min-w-0 shadow-xs">
          <CardHeader>
            <CardTitle>
              <h2>{widget.label}</h2>
            </CardTitle>
            {widget.description ? <CardDescription>{widget.description}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <ChartBody widget={widget} locale={locale} rangeLabel={rangeLabel} />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function ChartGridSkeleton({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Loading charts" className={GRID}>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} className="gap-4 p-5 shadow-xs" aria-hidden="true">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-64 w-full" />
        </Card>
      ))}
    </div>
  );
}
