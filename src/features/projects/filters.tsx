"use client";

import { Columns3, List } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from "@/config/projects";
import { useUrlQuery } from "@/hooks/use-url-query";
import { cn } from "@/lib/utils";

const ALL = "all";

function useFilter() {
  const query = useUrlQuery();
  const filter = (key: string, label: string, options: readonly SelectOption[]) => (
    <SelectInput
      aria-label={label}
      className="sm:w-44"
      value={query.get(key) || ALL}
      onValueChange={(value) => query.set({ [key]: value === ALL ? null : value })}
      options={[{ value: ALL, label: `All ${label.toLowerCase()}` }, ...options]}
    />
  );
  const reset = (keys: readonly string[]) =>
    query.hasAny(keys) ? () => query.set(Object.fromEntries(keys.map((key) => [key, null]))) : undefined;
  return { query, filter, reset };
}

const PROJECT_KEYS = ["search", "status", "customerId"] as const;

export function ProjectFilters() {
  const { query, filter, reset } = useFilter();
  return (
    <FilterBar
      search={
        <SearchInput
          label="Search projects"
          placeholder="Search name, customer or ID…"
          defaultValue={query.get("search")}
          onSearch={(value) => query.set({ search: value })}
          className="sm:w-72"
        />
      }
      onReset={reset(PROJECT_KEYS)}
    >
      {filter("status", "Statuses", [
        { value: "open", label: "Open (not completed or cancelled)" },
        ...PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] })),
      ])}
    </FilterBar>
  );
}

/** Filters that carry over when switching between the task list and the board. */
const SHARED_TASK_KEYS = ["projectId", "mine"] as const;

function TaskViewSwitch() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shared = new URLSearchParams();
  for (const key of SHARED_TASK_KEYS) {
    const value = searchParams.get(key);
    if (value) shared.set(key, value);
  }
  const suffix = shared.size > 0 ? `?${shared.toString()}` : "";
  const views = [
    { href: "/projects/tasks", label: "List", icon: List },
    { href: "/projects/board", label: "Board", icon: Columns3 },
  ];
  return (
    <nav aria-label="Task views" className="inline-flex rounded-md border p-0.5">
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

interface TaskFiltersProps {
  projects: SelectOption[];
  /** The full list has status/priority/due filters and search; the board only project and "mine". */
  board?: boolean;
  /** Offer "My tasks" (the user has a linked employee record). */
  withMine: boolean;
}

export function TaskFilters({ projects, board = false, withMine }: TaskFiltersProps) {
  const { query, filter, reset } = useFilter();
  const keys = board
    ? SHARED_TASK_KEYS
    : ([...SHARED_TASK_KEYS, "search", "status", "priority", "due"] as const);
  return (
    <FilterBar
      search={
        board ? undefined : (
          <SearchInput
            label="Search tasks"
            placeholder="Search task, project or ID…"
            defaultValue={query.get("search")}
            onSearch={(value) => query.set({ search: value })}
            className="sm:w-64"
          />
        )
      }
      onReset={reset(keys)}
      actions={<TaskViewSwitch />}
    >
      {filter("projectId", "Projects", projects)}
      {board
        ? null
        : filter("status", "Statuses", [
            { value: "open", label: "Open (not completed)" },
            ...TASK_STATUSES.map((status) => ({ value: status, label: TASK_STATUS_LABELS[status] })),
          ])}
      {board
        ? null
        : filter(
            "priority",
            "Priorities",
            TASK_PRIORITIES.map((priority) => ({ value: priority, label: TASK_PRIORITY_LABELS[priority] })),
          )}
      {board
        ? null
        : filter("due", "Deadlines", [
            { value: "overdue", label: "Overdue" },
            { value: "soon", label: "Due in the next 3 days" },
          ])}
      {withMine ? filter("mine", "Assignees", [{ value: "1", label: "Assigned to me" }]) : null}
    </FilterBar>
  );
}
