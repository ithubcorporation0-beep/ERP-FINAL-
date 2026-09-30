import { CalendarClock } from "lucide-react";
import type { Deadline } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { DEADLINE_LABELS, isUrgentDeadline } from "./labels";

/** A due date with its deadline state in words ("Overdue", "Due today", "Due soon") — never color alone. */
export function DeadlineText({
  dueLabel,
  deadline,
  compact = false,
}: {
  dueLabel: string | null;
  deadline: Deadline;
  compact?: boolean;
}) {
  if (!dueLabel) return <span className="text-muted-foreground">{compact ? "" : "—"}</span>;
  const urgent = isUrgentDeadline(deadline);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        deadline === "overdue" ? "font-medium text-danger" : urgent ? "font-medium text-warning" : undefined,
        compact && !urgent && "text-muted-foreground",
      )}
    >
      {compact ? <CalendarClock className="size-3.5" aria-hidden="true" /> : null}
      {dueLabel}
      {urgent ? <span> · {DEADLINE_LABELS[deadline]}</span> : null}
    </span>
  );
}
