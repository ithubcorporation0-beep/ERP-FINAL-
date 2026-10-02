"use client";

import { Download, ScrollText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUrlQuery } from "@/hooks/use-url-query";

export interface AuditRow {
  id: string;
  at: string;
  atLabel: string;
  actor: string;
  actorEmail: string | null;
  group: string;
  verb: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
}

const ALL = "all";
const FILTER_KEYS = ["search", "action", "entityType", "actorId", "from", "to"] as const;
const col = createDataTableColumns<AuditRow>();

interface AuditLogListProps {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  groups: SelectOption[];
  entityTypes: string[];
  actors: SelectOption[];
  /** Query string of the current filters, for the CSV export link; null when the user can't export. */
  exportQuery: string | null;
}

/** Searchable, filterable audit log (read-only). Rows open the full entry. */
export function AuditLogList({
  rows,
  total,
  page,
  pageSize,
  groups,
  entityTypes,
  actors,
  exportQuery,
}: AuditLogListProps) {
  const router = useRouter();
  const query = useUrlQuery();

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("atLabel", {
          header: "When",
          enableSorting: false,
          cell: ({ row }) => (
            <time dateTime={row.original.at} className="whitespace-nowrap">
              {row.original.atLabel}
            </time>
          ),
        }),
        col.accessor("actor", {
          header: "User",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <p className="truncate">{row.original.actor}</p>
              {row.original.actorEmail ? (
                <p className="truncate text-xs text-muted-foreground">{row.original.actorEmail}</p>
              ) : null}
            </div>
          ),
        }),
        col.accessor("verb", {
          header: "Action",
          enableSorting: false,
          cell: ({ row }) => (
            <div>
              <Link
                href={`/audit-logs/${row.original.id}`}
                className="font-medium hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {row.original.verb}
              </Link>
              <p className="text-xs text-muted-foreground">
                {row.original.group} · <span className="font-mono">{row.original.action}</span>
              </p>
            </div>
          ),
        }),
        col.accessor("entityType", {
          header: "Record",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <p>{row.original.entityType}</p>
              {row.original.entityId ? (
                <p className="truncate font-mono text-xs text-muted-foreground">{row.original.entityId}</p>
              ) : null}
            </div>
          ),
        }),
        col.accessor("ipAddress", {
          header: "IP address",
          enableSorting: false,
          cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() ?? "—"}</span>,
        }),
      ]),
    [],
  );

  const select = (key: string, label: string, options: readonly SelectOption[], width = "sm:w-48") => (
    <SelectInput
      aria-label={label}
      className={width}
      value={query.get(key) || ALL}
      onValueChange={(value) => query.set({ [key]: value === ALL ? null : value })}
      options={[{ value: ALL, label: `All ${label.toLowerCase()}` }, ...options]}
    />
  );

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput
            label="Search the audit log"
            placeholder="Search action, user, record ID or IP…"
            defaultValue={query.get("search")}
            onSearch={(value) => query.set({ search: value })}
            className="sm:w-72"
          />
        }
        onReset={
          query.hasAny(FILTER_KEYS)
            ? () => query.set(Object.fromEntries(FILTER_KEYS.map((key) => [key, null])))
            : undefined
        }
        actions={
          exportQuery !== null ? (
            <Button asChild variant="outline">
              <a href={`/api/audit-logs/export${exportQuery ? `?${exportQuery}` : ""}`} download>
                <Download aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          ) : undefined
        }
      >
        {select("action", "Areas", groups)}
        {select(
          "entityType",
          "Record types",
          entityTypes.map((type) => ({ value: type, label: type })),
        )}
        {select("actorId", "Users", actors)}
        <div className="flex items-center gap-1">
          <Label htmlFor="audit-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="audit-from"
            type="date"
            className="w-36"
            value={query.get("from")}
            onChange={(event) => query.set({ from: event.target.value || null })}
          />
        </div>
        <div className="flex items-center gap-1">
          <Label htmlFor="audit-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="audit-to"
            type="date"
            className="w-36"
            value={query.get("to")}
            onChange={(event) => query.set({ to: event.target.value || null })}
          />
        </div>
      </FilterBar>
      <DataTable
        caption="Audit log"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(`/audit-logs/${row.original.id}`)}
        emptyState={
          query.hasAny(FILTER_KEYS) ? (
            <EmptyState size="compact" title="No matching entries" description="Try other filters." />
          ) : (
            <EmptyState size="compact" icon={ScrollText} title="No audit entries yet" />
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
