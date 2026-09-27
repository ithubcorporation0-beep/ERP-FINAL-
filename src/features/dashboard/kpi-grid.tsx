import type { KpiId } from "@/config/dashboard";
import { KpiCard, KpiCardSkeleton } from "@/components/shared/kpi-card";
import { formatCurrency } from "@/lib/utils";
import type { KpiData, WidgetState } from "@/server/services/dashboard.service";
import { KPI_ICONS } from "./icons";
import { UnavailableNote } from "@/components/shared/unavailable-note";
import { WidgetError } from "./widget-states";

export interface KpiWidget {
  id: KpiId;
  label: string;
  state: WidgetState<KpiData>;
}

interface KpiGridProps {
  kpis: KpiWidget[];
  currency: string;
  locale: string;
  /** e.g. "Last 6 months" — describes `addedInRange`. */
  rangeLabel: string;
}

function formatValue(data: KpiData, currency: string, locale: string): string {
  return data.format === "currency"
    ? formatCurrency(data.value, currency, locale)
    : new Intl.NumberFormat(locale).format(data.value);
}

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

export function KpiGrid({ kpis, currency, locale, rangeLabel }: KpiGridProps) {
  return (
    <section aria-label="Key figures" className={GRID}>
      {kpis.map(({ id, label, state }) => {
        const icon = KPI_ICONS[id];
        if (state.status === "ready") {
          const added = state.data.addedInRange;
          return (
            <KpiCard
              key={id}
              label={label}
              icon={icon}
              value={formatValue(state.data, currency, locale)}
              hint={
                added === undefined
                  ? undefined
                  : `+${new Intl.NumberFormat(locale).format(added)} new · ${rangeLabel.toLowerCase()}`
              }
            />
          );
        }
        return (
          <KpiCard
            key={id}
            label={label}
            icon={icon}
            value="—"
            className="bg-muted/30"
            footer={
              state.status === "unavailable" ? (
                <UnavailableNote module={state.module} phase={state.phase} />
              ) : (
                <WidgetError label={label} />
              )
            }
          />
        );
      })}
    </section>
  );
}

export function KpiGridSkeleton({ count }: { count: number }) {
  return (
    <div role="status" aria-label="Loading key figures" className={GRID}>
      {Array.from({ length: count }, (_, index) => (
        <KpiCardSkeleton key={index} />
      ))}
    </div>
  );
}
