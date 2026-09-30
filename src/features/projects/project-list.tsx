"use client";

import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { PROJECT_STATUS_LABELS } from "@/config/projects";
import { useUrlQuery } from "@/hooks/use-url-query";
import { PROJECT_STATUS_TONES } from "./labels";
import { ProgressBar } from "./progress-bar";
import { daysLeftLabel, type ProjectRow } from "./rows";

const FILTER_KEYS = ["search", "status", "customerId"] as const;
const col = createDataTableColumns<ProjectRow>();

interface ProjectListProps {
  rows: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  canCreate: boolean;
}

export function ProjectList({ rows, total, page, pageSize, canCreate }: ProjectListProps) {
  const router = useRouter();
  const query = useUrlQuery();

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("code", {
          header: "Project ID",
          enableSorting: false,
          cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
        }),
        col.accessor("name", {
          header: "Project",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link
                href={`/projects/${row.original.id}`}
                className="font-medium hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {row.original.name}
              </Link>
              {row.original.customerName ? (
                <p className="truncate text-xs text-muted-foreground">{row.original.customerName}</p>
              ) : null}
            </div>
          ),
        }),
        col.accessor("status", {
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={PROJECT_STATUS_TONES[row.original.status]}>
              {PROJECT_STATUS_LABELS[row.original.status]}
            </StatusBadge>
          ),
        }),
        col.accessor("managerName", {
          header: "Manager",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">None</span>,
        }),
        col.accessor("work", {
          header: "Progress",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="space-y-1">
              <ProgressBar
                value={row.original.work}
                label={`Progress of ${row.original.name}`}
                empty="No tasks"
              />
              {row.original.tasksTotal > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {row.original.tasksDone} of {row.original.tasksTotal} tasks done
                  {row.original.tasksOverdue > 0 ? (
                    <span className="font-medium text-danger"> · {row.original.tasksOverdue} overdue</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ),
        }),
        col.accessor("endLabel", {
          header: "End date",
          enableSorting: false,
          cell: ({ row }) =>
            row.original.endLabel ? (
              <div>
                <p className={row.original.overdue ? "font-medium text-danger" : undefined}>
                  {row.original.endLabel}
                </p>
                {row.original.daysLeft !== null ? (
                  <p className="text-xs text-muted-foreground">{daysLeftLabel(row.original.daysLeft)}</p>
                ) : null}
              </div>
            ) : (
              "—"
            ),
        }),
        col.accessor("budgetLabel", {
          header: "Budget",
          enableSorting: false,
          cell: ({ getValue }) => <span data-numeric>{getValue() ?? "—"}</span>,
        }),
      ]),
    [],
  );

  return (
    <div className="space-y-4">
      <DataTable
        caption="Projects"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(`/projects/${row.original.id}`)}
        emptyState={
          query.hasAny(FILTER_KEYS) ? (
            <EmptyState
              size="compact"
              title="No matching projects"
              description="Try other search terms or filters."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={FolderKanban}
              title="No projects yet"
              description={
                canCreate
                  ? "Create a project, then add tasks and assign them to your team."
                  : "Projects you manage or have tasks in will appear here."
              }
              action={
                canCreate ? (
                  <Button asChild size="sm">
                    <Link href="/projects/new">
                      <Plus aria-hidden="true" />
                      New project
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
