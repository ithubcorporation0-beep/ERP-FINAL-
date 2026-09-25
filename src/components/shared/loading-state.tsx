import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Inline spinner + label for small areas. For whole pages prefer the skeletons in `skeletons.tsx`. */
export function LoadingState({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground", className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
