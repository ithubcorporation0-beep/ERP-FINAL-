"use client";

import { Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { SortingState } from "@tanstack/react-table";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  type CustomerStatusKey,
  type CustomerTypeKey,
} from "@/config/crm";
import { useUrlQuery } from "@/hooks/use-url-query";
import { CUSTOMER_STATUS_TONES, optionsOf } from "./labels";

export interface CustomerRow {
  id: string;
  number: number;
  code: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  type: CustomerTypeKey;
  status: CustomerStatusKey;
  /** Preformatted in the company's locale. */
  createdAt: string;
}

interface CustomerListProps {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: { id: string; desc: boolean };
  countries: SelectOption[];
  canCreate: boolean;
}

const FILTER_KEYS = ["search", "status", "type", "country"] as const;
const ALL = "all";
const col = createDataTableColumns<CustomerRow>();

export function CustomerList({ rows, total, page, pageSize, sort, countries, canCreate }: CustomerListProps) {
  const router = useRouter();
  const query = useUrlQuery();
  const filtered = query.hasAny(FILTER_KEYS);
  const sorting: SortingState = [sort];

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("number", {
          id: "number",
          header: ({ column }) => <DataTableColumnHeader column={column} title="Customer ID" />,
          cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
        }),
        col.accessor("name", {
          header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link
                href={`/crm/customers/${row.original.id}`}
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
        col.display({
          id: "contact",
          header: "Contact",
          cell: ({ row }) => (
            <div className="min-w-0 text-sm">
              <p className="truncate">{row.original.email ?? "—"}</p>
              <p className="truncate text-xs text-muted-foreground">{row.original.phone ?? ""}</p>
            </div>
          ),
        }),
        col.accessor("location", {
          header: "Location",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        col.accessor("type", {
          header: "Type",
          enableSorting: false,
          cell: ({ row }) => CUSTOMER_TYPE_LABELS[row.original.type],
        }),
        col.accessor("status", {
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={CUSTOMER_STATUS_TONES[row.original.status]}>
              {CUSTOMER_STATUS_LABELS[row.original.status]}
            </StatusBadge>
          ),
        }),
        col.accessor("createdAt", {
          header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        }),
      ]),
    [],
  );

  const filter = (key: string, label: string, options: readonly SelectOption[]) => (
    <SelectInput
      aria-label={label}
      className="sm:w-40"
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
            label="Search customers"
            placeholder="Search name, company, email, phone or ID…"
            defaultValue={query.get("search")}
            onSearch={(value) => query.set({ search: value })}
            className="sm:w-80"
          />
        }
        onReset={
          filtered ? () => query.set(Object.fromEntries(FILTER_KEYS.map((key) => [key, null]))) : undefined
        }
      >
        {filter("status", "Statuses", optionsOf(CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS))}
        {filter("type", "Types", optionsOf(CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS))}
        {filter("country", "Countries", countries)}
      </FilterBar>

      <DataTable
        caption="Customers"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        loadingRows={Math.min(rows.length || 5, 10)}
        manualSorting
        sorting={sorting}
        onSortingChange={(updater) => {
          const next = typeof updater === "function" ? updater(sorting) : updater;
          const first = next[0];
          query.set(first ? { sort: first.id, dir: first.desc ? "desc" : "asc" } : { sort: null, dir: null });
        }}
        onRowClick={(row) => router.push(`/crm/customers/${row.original.id}`)}
        emptyState={
          filtered ? (
            <EmptyState
              size="compact"
              title="No matching customers"
              description="Try other search terms or filters."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={Users}
              title="No customers yet"
              description="Customers you add, or leads you convert, appear here."
              action={
                canCreate ? (
                  <Button asChild size="sm">
                    <Link href="/crm/customers/new">
                      <Plus aria-hidden="true" />
                      Add customer
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
