import { History } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export interface HistoryItem {
  id: string;
  label: string;
  detail: string | null;
  actorName: string | null;
  /** ISO timestamp and its preformatted display value. */
  at: string;
  atLabel: string;
}

/** Timeline of a record's changes, newest first (from the audit log). */
export function HistoryList({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) {
    return <EmptyState size="compact" icon={History} title="No history yet" />;
  }
  return (
    <ol className="relative space-y-4 border-l pl-5">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span
            className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary"
            aria-hidden="true"
          />
          <p className="text-sm font-medium">{item.label}</p>
          {item.detail ? <p className="text-sm text-muted-foreground">{item.detail}</p> : null}
          <p className="text-xs text-muted-foreground">
            {item.actorName ?? "System"} · <time dateTime={item.at}>{item.atLabel}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
