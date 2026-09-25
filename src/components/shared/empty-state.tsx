import { Inbox, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <h2 className="text-base font-medium">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </section>
  );
}
