"use client";

import { Columns3, List } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { LEAD_SOURCE_LABELS, LEAD_SOURCES, LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/config/crm";
import { useUrlQuery } from "@/hooks/use-url-query";
import { cn } from "@/lib/utils";
import { optionsOf } from "./labels";

const ALL = "all";
/** Filters that carry over when switching between list and pipeline. */
const SHARED_KEYS = ["search", "source", "assignee"] as const;

/** Switches between the lead list and the pipeline board, keeping the shared filters. */
function ViewSwitch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shared = new URLSearchParams();
  for (const key of SHARED_KEYS) {
    const value = searchParams.get(key);
    if (value) shared.set(key, value);
  }
  const suffix = shared.size > 0 ? `?${shared.toString()}` : "";
  const views = [
    { href: "/crm/leads", label: "List", icon: List },
    { href: "/crm/leads/pipeline", label: "Pipeline", icon: Columns3 },
  ];
  return (
    <nav aria-label="Lead views" className="inline-flex rounded-md border p-0.5">
      {views.map((view) => {
        const active = pathname === view.href;
        return (
          <Button
            key={view.href}
            asChild
            size="sm"
            variant={active ? "secondary" : "ghost"}
            className={cn(!active && "text-muted-foreground")}
          >
            <Link href={`${view.href}${suffix}`} aria-current={active ? "page" : undefined}>
              <view.icon aria-hidden="true" />
              {view.label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}

export function LeadFilters({ assignees, withStatus }: { assignees: SelectOption[]; withStatus: boolean }) {
  const query = useUrlQuery();
  const keys = withStatus ? [...SHARED_KEYS, "status"] : SHARED_KEYS;
  const filter = (key: string, label: string, options: readonly SelectOption[]) => (
    <SelectInput
      aria-label={label}
      className="sm:w-44"
      value={query.get(key) || ALL}
      onValueChange={(value) => query.set({ [key]: value === ALL ? null : value })}
      options={[{ value: ALL, label: `All ${label.toLowerCase()}` }, ...options]}
    />
  );

  return (
    <FilterBar
      search={
        <SearchInput
          label="Search leads"
          placeholder="Search name, company, email, phone or ID…"
          defaultValue={query.get("search")}
          onSearch={(value) => query.set({ search: value })}
          className="sm:w-72"
        />
      }
      onReset={
        query.hasAny(keys) ? () => query.set(Object.fromEntries(keys.map((key) => [key, null]))) : undefined
      }
      actions={<ViewSwitch />}
    >
      {withStatus ? filter("status", "Stages", optionsOf(LEAD_STATUSES, LEAD_STATUS_LABELS)) : null}
      {filter("source", "Sources", optionsOf(LEAD_SOURCES, LEAD_SOURCE_LABELS))}
      {filter("assignee", "Assignees", [
        { value: "me", label: "Assigned to me" },
        { value: "none", label: "Unassigned" },
        ...assignees,
      ])}
    </FilterBar>
  );
}
