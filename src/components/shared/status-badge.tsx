import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<StatusTone, { badge: string; dot: string }> = {
  neutral: { badge: "bg-neutral-muted text-neutral border-neutral-border", dot: "bg-neutral" },
  info: { badge: "bg-info-muted text-info border-info-border", dot: "bg-info" },
  success: { badge: "bg-success-muted text-success border-success-border", dot: "bg-success" },
  warning: { badge: "bg-warning-muted text-warning border-warning-border", dot: "bg-warning" },
  danger: { badge: "bg-danger-muted text-danger border-danger-border", dot: "bg-danger" },
};

interface StatusBadgeProps {
  tone?: StatusTone;
  children: React.ReactNode;
  /** Show a leading colored dot. Color is never the only signal — the label always carries meaning. */
  dot?: boolean;
  className?: string;
}

/**
 * Consistent status pill. Map domain states to tones in the module, e.g.
 * `{ PAID: "success", OVERDUE: "danger", DRAFT: "neutral" }`.
 */
export function StatusBadge({ tone = "neutral", children, dot = true, className }: StatusBadgeProps) {
  const classes = TONE_CLASSES[tone];
  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        classes.badge,
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className={cn("size-1.5 rounded-full", classes.dot)} /> : null}
      {children}
    </span>
  );
}
