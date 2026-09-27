import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shown instead of numbers, charts or related records when the module that owns the data has not been released
 * yet. Never replace it with placeholder data.
 */
export function UnavailableNote({
  module,
  phase,
  className,
}: {
  module: string;
  phase: number;
  className?: string;
}) {
  return (
    <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Not tracked yet — appears when the {module} module is released (phase {String(phase).padStart(2, "0")}
        ).
      </span>
    </p>
  );
}
