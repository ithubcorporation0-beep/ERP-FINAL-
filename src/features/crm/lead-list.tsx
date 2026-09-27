"use client";

import { Plus, Target } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, type LeadSourceKey, type LeadStatusKey } from "@/config/crm";
import { useUrlQuery } from "@/hooks/use-url-query";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_TONES } from "./labels";

export interface LeadRow {
  id: string;
  code: string;
  name: string;
  companyName: string | null;
  status: LeadStatusKey;
  source: LeadSourceKey;
  assigneeName: string | null;
  expectedValueLabel: string | null;
  followUpLabel: string | null;
  followUpOverdue: boolean;
  createdAt: string;
}

const FILTER_KEYS = ["search", "status", "source", "assignee"] as const;
const col = createDataTableColumns<LeadRow>();

interface LeadListProps {
  rows: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  canCreate: boolean;
}

export function LeadList({ rows, total, page, pageSize, canCreate }: LeadListProps) {
  const router = useRouter();
  const query = useUrlQuery();

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("code", {
          header: "Lead ID",
          enableSorting: false,
          cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
        }),
        col.accessor("name", {
          header: "Name",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link
                href={`/crm/leads/${row.original.id}`}
                className="font-medium hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {row.original.name}
              </Link>
              {row.original.companyName ? (
                <p className="truncate text-xs text-muted-foreground">{row.original.companyName}</p>
              ) : null}
            </div>
          ),
        }),
        col.accessor("status", {
          header: "Stage",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={LEAD_STATUS_TONES[row.original.status]}>
              {LEAD_STATUS_LABELS[row.original.status]}
            </StatusBadge>
          ),
        }),
        col.accessor("source", {
          header: "Source",
          enableSorting: false,
          cell: ({ row }) => LEAD_SOURCE_LABELS[row.original.source],
        }),
        col.accessor("assigneeName", {
          header: "Assigned to",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">Unassigned</span>,
        }),
        col.accessor("expectedValueLabel", {
          header: "Expected value",
          enableSorting: false,
          cell: ({ getValue }) => <span data-numeric>{getValue() ?? "—"}</span>,
        }),
        col.accessor("followUpLabel", {
          header: "Follow-up",
          enableSorting: false,
          cell: ({ row }) =>
            row.original.followUpLabel ? (
              <span className={cn(row.original.followUpOverdue && "font-medium text-danger")}>
                {row.original.followUpLabel}
                {row.original.followUpOverdue ? <span className="sr-only"> (overdue)</span> : null}
              </span>
            ) : (
              "—"
            ),
        }),
        col.accessor("createdAt", { header: "Created", enableSorting: false }),
      ]),
    [],
  );

  return (
    <div className="space-y-4">
      <DataTable
        caption="Leads"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(`/crm/leads/${row.original.id}`)}
        emptyState={
          query.hasAny(FILTER_KEYS) ? (
            <EmptyState
              size="compact"
              title="No matching leads"
              description="Try other search terms or filters."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={Target}
              title="No leads yet"
              description="Add potential customers and track them through the pipeline."
              action={
                canCreate ? (
                  <Button asChild size="sm">
                    <Link href="/crm/leads/new">
                      <Plus aria-hidden="true" />
                      Add lead
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
