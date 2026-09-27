import { AlertCircle, Clock } from "lucide-react";
import { RetryButton } from "./retry-button";

/** Shown instead of a number or chart when the module that owns the data has not been released yet. */
export function UnavailableNote({ module, phase }: { module: string; phase: number }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        Not tracked yet — appears when the {module} module is released (phase {String(phase).padStart(2, "0")}
        ).
      </span>
    </p>
  );
}

/** Shown on a single widget whose data failed to load; the rest of the dashboard keeps working. */
export function WidgetError({ label }: { label: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-sm">
      <p className="flex items-start gap-1.5 text-danger">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Couldn’t load {label.toLowerCase()}.</span>
      </p>
      <RetryButton />
    </div>
  );
}
