"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { SelectInput } from "@/components/forms/select-input";
import { DATE_RANGE_LABELS, DATE_RANGE_PRESETS, type DateRangePreset } from "@/lib/date-range";

const OPTIONS = DATE_RANGE_PRESETS.map((preset) => ({ value: preset, label: DATE_RANGE_LABELS[preset] }));

/** Date filter for the dashboard and financial reports. Keeps the choice in the URL (`?range=`) so it survives reloads and can be shared. */
export function RangeFilter({ value }: { value: DateRangePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", next);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-2">
      {pending ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />
      ) : null}
      <SelectInput aria-label="Date range" options={OPTIONS} value={value} onValueChange={change} />
    </div>
  );
}
