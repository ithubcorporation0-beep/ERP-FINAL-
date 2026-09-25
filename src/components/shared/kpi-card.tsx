import { ArrowDownRight, ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface KpiChange {
  /** Preformatted, e.g. "12.5%" or "$1,200". */
  value: string;
  direction: "up" | "down" | "flat";
  /** Whether this movement is good news. Revenue up = positive; overdue invoices up = negative. */
  sentiment?: "positive" | "negative" | "neutral";
  /** Comparison period, e.g. "vs last month". */
  label?: string;
}

interface KpiCardProps {
  label: string;
  /** Preformatted display value (use formatCurrency / Intl for numbers). */
  value: string;
  icon?: LucideIcon;
  change?: KpiChange;
  hint?: string;
  className?: string;
}

const DIRECTION_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;
const SENTIMENT_CLASS = {
  positive: "text-success",
  negative: "text-danger",
  neutral: "text-muted-foreground",
} as const;

export function KpiCard({ label, value, icon: Icon, change, hint, className }: KpiCardProps) {
  const ChangeIcon = change ? DIRECTION_ICON[change.direction] : null;
  return (
    <Card className={cn("gap-3 p-5 shadow-xs", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p data-numeric className="text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {change || hint ? (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {change && ChangeIcon ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                SENTIMENT_CLASS[change.sentiment ?? "neutral"],
              )}
            >
              <ChangeIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">
                {change.direction === "flat" ? "No change" : `${change.direction} `}
              </span>
              {change.value}
            </span>
          ) : null}
          {change?.label ? <span>{change.label}</span> : null}
          {hint ? <span>{hint}</span> : null}
        </p>
      ) : null}
    </Card>
  );
}

export function KpiCardSkeleton() {
  return (
    <Card className="gap-3 p-5 shadow-xs" aria-hidden="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-8 rounded-md" />
      </div>
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-3 w-28" />
    </Card>
  );
}
