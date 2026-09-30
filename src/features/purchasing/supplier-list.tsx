"use client";

import { Plus, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { SelectInput } from "@/components/forms/select-input";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { useUrlQuery } from "@/hooks/use-url-query";

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  products: number;
  isActive: boolean;
}

const FILTER_KEYS = ["search", "inactive"] as const;
const col = createDataTableColumns<SupplierRow>();

interface SupplierListProps {
  rows: SupplierRow[];
  total: number;
  page: number;
  pageSize: number;
  canCreate: boolean;
}

export function SupplierList({ rows, total, page, pageSize, canCreate }: SupplierListProps) {
  const router = useRouter();
  const query = useUrlQuery();

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("code", {
          header: "Supplier ID",
          enableSorting: false,
          cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
        }),
        col.accessor("name", {
          header: "Name",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link
                href={`/purchasing/suppliers/${row.original.id}`}
                className="font-medium hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {row.original.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.companyName ?? ""}
                {row.original.isActive ? "" : " · Inactive"}
              </p>
            </div>
          ),
        }),
        col.accessor("phone", {
          header: "Phone",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        col.accessor("email", {
          header: "Email",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        col.accessor("taxId", {
          header: "Tax number",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? "—",
        }),
        col.accessor("products", {
          header: () => <span className="block text-right">Products</span>,
          enableSorting: false,
          cell: ({ getValue }) => (
            <span className="block text-right" data-numeric>
              {getValue()}
            </span>
          ),
        }),
      ]),
    [],
  );

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput
            label="Search suppliers"
            placeholder="Search name, company, email, phone or ID…"
            defaultValue={query.get("search")}
            onSearch={(value) => query.set({ search: value })}
            className="sm:w-80"
          />
        }
        onReset={query.hasAny(FILTER_KEYS) ? () => query.set({ search: null, inactive: null }) : undefined}
      >
        <SelectInput
          aria-label="Suppliers"
          className="sm:w-48"
          value={query.get("inactive") || "active"}
          onValueChange={(value) => query.set({ inactive: value === "1" ? "1" : null })}
          options={[
            { value: "active", label: "Active suppliers" },
            { value: "1", label: "Include inactive" },
          ]}
        />
      </FilterBar>
      <DataTable
        caption="Suppliers"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(`/purchasing/suppliers/${row.original.id}`)}
        emptyState={
          query.hasAny(FILTER_KEYS) ? (
            <EmptyState size="compact" title="No matching suppliers" description="Try other search terms." />
          ) : (
            <EmptyState
              size="compact"
              icon={Truck}
              title="No suppliers yet"
              description="Add the companies you buy products from."
              action={
                canCreate ? (
                  <Button asChild size="sm">
                    <Link href="/purchasing/suppliers/new">
                      <Plus aria-hidden="true" />
                      Add supplier
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
