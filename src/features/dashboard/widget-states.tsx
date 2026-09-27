import { AlertCircle } from "lucide-react";
import { RetryButton } from "./retry-button";

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
