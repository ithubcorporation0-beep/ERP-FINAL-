import { Activity } from "lucide-react";
import type { ActivityId } from "@/config/dashboard";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityItem } from "@/server/services/dashboard.service";
import { ACTIVITY_ICONS } from "./icons";
import { WidgetError } from "./widget-states";

interface ActivityFeedProps {
  items: ActivityItem[];
  tracked: Array<{ id: ActivityId; label: string }>;
  unavailable: Array<{ id: ActivityId; label: string; module: string; phase: number }>;
  failed: Array<{ id: ActivityId; label: string }>;
  locale: string;
  timeZone: string;
}

const SOURCE_LABELS: Record<ActivityId, string> = {
  newCustomers: "New customer",
  newInvoices: "New invoice",
  payments: "Payment",
  expenses: "Expense",
  employeeActivity: "Employee",
  projectUpdates: "Project",
};

/** ["New customers", "Payments"] → "New customers and payments". */
function sentence(labels: string[], locale: string): string {
  const text = new Intl.ListFormat(locale, { type: "conjunction" }).format(
    labels.map((label) => label.toLowerCase()),
  );
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function ActivityFeed({ items, tracked, unavailable, failed, locale, timeZone }: ActivityFeedProps) {
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
  return (
    <Card className="min-w-0 shadow-xs">
      <CardHeader>
        <CardTitle>
          <h2>Recent activity</h2>
        </CardTitle>
        <CardDescription>The latest records added in your company.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed.map((source) => (
          <WidgetError key={source.id} label={source.label} />
        ))}
        {items.length > 0 ? (
          <ol className="divide-y">
            {items.map((item) => {
              const Icon = ACTIVITY_ICONS[item.source];
              return (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{SOURCE_LABELS[item.source]}</p>
                  </div>
                  <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">
                    {dateTime.format(new Date(item.at))}
                  </time>
                </li>
              );
            })}
          </ol>
        ) : failed.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Activity}
            title="No activity yet"
            description={
              tracked.length > 0
                ? `${sentence(
                    tracked.map((source) => source.label),
                    locale,
                  )} will show up here.`
                : "Activity will show up here as modules are released."
            }
          />
        ) : null}
        {unavailable.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">Not tracked yet:</p>
            <ul className="flex flex-wrap gap-1.5">
              {unavailable.map((source) => (
                <li key={source.id}>
                  <Badge variant="outline" title={`Arrives with the ${source.module} module`}>
                    {source.label}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ActivityFeedSkeleton() {
  return (
    <Card role="status" aria-label="Loading recent activity" className="gap-4 p-5 shadow-xs">
      <Skeleton className="h-5 w-40" aria-hidden="true" />
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3" aria-hidden="true">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </Card>
  );
}
