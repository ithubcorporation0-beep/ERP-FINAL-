import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 p-6 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
