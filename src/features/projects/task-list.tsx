"use client";

import { ListChecks, Paperclip, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/config/projects";
import { useUrlQuery } from "@/hooks/use-url-query";
import { DeadlineText } from "./deadline-text";
import { TASK_PRIORITY_TONES, TASK_STATUS_TONES } from "./labels";
import type { TaskRow } from "./rows";

const FILTER_KEYS = ["search", "projectId", "status", "priority", "due", "mine"] as const;
const col = createDataTableColumns<TaskRow>();

interface TaskListProps {
  rows: TaskRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Link for "New task", or null when the user can't create tasks. */
  createHref: string | null;
}

export function TaskList({ rows, total, page, pageSize, createHref }: TaskListProps) {
  const router = useRouter();
  const query = useUrlQuery();

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("code", {
          header: "Task ID",
          enableSorting: false,
          cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
        }),
        col.accessor("name", {
          header: "Task",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link
                href={`/projects/tasks/${row.original.id}`}
                className="font-medium hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {row.original.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.projectName}
                {row.original.attachments > 0 ? (
                  <span className="ml-2 inline-flex items-center gap-0.5">
                    <Paperclip className="size-3" aria-hidden="true" />
                    {row.original.attachments}
                    <span className="sr-only"> attachments</span>
                  </span>
                ) : null}
              </p>
            </div>
          ),
        }),
        col.accessor("status", {
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={TASK_STATUS_TONES[row.original.status]}>
              {TASK_STATUS_LABELS[row.original.status]}
            </StatusBadge>
          ),
        }),
        col.accessor("priority", {
          header: "Priority",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={TASK_PRIORITY_TONES[row.original.priority]} dot={false}>
              {TASK_PRIORITY_LABELS[row.original.priority]}
            </StatusBadge>
          ),
        }),
        col.accessor("assigneeName", {
          header: "Assigned to",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">Unassigned</span>,
        }),
        col.accessor("dueLabel", {
          header: "Due date",
          enableSorting: false,
          cell: ({ row }) => (
            <DeadlineText dueLabel={row.original.dueLabel} deadline={row.original.deadline} />
          ),
        }),
      ]),
    [],
  );

  return (
    <div className="space-y-4">
      <DataTable
        caption="Tasks"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(`/projects/tasks/${row.original.id}`)}
        emptyState={
          query.hasAny(FILTER_KEYS) ? (
            <EmptyState
              size="compact"
              title="No matching tasks"
              description="Try other search terms or filters."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={ListChecks}
              title="No tasks yet"
              description={
                createHref
                  ? "Add tasks to a project and assign them to your team."
                  : "Tasks assigned to you will appear here."
              }
              action={
                createHref ? (
                  <Button asChild size="sm">
                    <Link href={createHref}>
                      <Plus aria-hidden="true" />
                      New task
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => query.set({ page: next })}
        onPageSizeChange={(size) => query.set({ pageSize: size })}
      />
    </div>
  );
}
