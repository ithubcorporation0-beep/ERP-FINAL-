import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  /** Usually a `SearchInput`. */
  search?: React.ReactNode;
  /** Filter controls (`SelectInput`, `DatePicker`, …). */
  children?: React.ReactNode;
  /** Right-aligned actions such as "Export" or "New". */
  actions?: React.ReactNode;
  /** Shows a "Reset" button when provided. */
  onReset?: () => void;
  resetDisabled?: boolean;
  className?: string;
}

/** Toolbar above a DataTable. Wraps onto multiple lines on narrow screens. */
export function FilterBar({ search, children, actions, onReset, resetDisabled, className }: FilterBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center", className)}
    >
      {search}
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      {onReset ? (
        <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={resetDisabled}>
          <RotateCcw aria-hidden="true" />
          Reset
        </Button>
      ) : null}
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div> : null}
    </div>
  );
}
