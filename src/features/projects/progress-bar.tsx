import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** Whole percent 0–100, or null when there's nothing to measure. */
  value: number | null;
  /** Accessible name, e.g. "Work progress". */
  label: string;
  /** Shown instead of a bar when `value` is null. */
  empty?: string;
  tone?: "primary" | "muted" | "danger";
  className?: string;
}

const FILL: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  primary: "bg-primary",
  muted: "bg-muted-foreground/50",
  danger: "bg-danger",
};

/** A labelled progress bar (role="progressbar") with the percentage as text, so color is never the only signal. */
export function ProgressBar({ value, label, empty = "—", tone = "primary", className }: ProgressBarProps) {
  if (value === null) return <span className="text-sm text-muted-foreground">{empty}</span>;
  return (
    <div className={cn("flex min-w-28 items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", FILL[tone])} style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right text-xs tabular-nums" data-numeric>
        {value}%
      </span>
    </div>
  );
}
