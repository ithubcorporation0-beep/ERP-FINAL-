"use client";

import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { STOCK_STATUS_LABELS } from "@/config/inventory";
import { useUrlQuery } from "@/hooks/use-url-query";
import { STOCK_STATUS_TONES } from "./labels";
import type { ProductRow } from "./rows";

const ALL = "all";
const FILTER_KEYS = ["search", "categoryId", "warehouseId", "stock", "inactive"] as const;
const col = createDataTableColumns<ProductRow>();

export function ProductFilters({
  categories,
  warehouses,
}: {
  categories: SelectOption[];
  warehouses: SelectOption[];
}) {
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
  return (
    <FilterBar
      search={
        <SearchInput
          label="Search products"
          placeholder="Search name, SKU, brand or ID…"
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
    >
      {filter("stock", "Stock levels", [
        { value: "low", label: "Low stock (at or below minimum)" },
        { value: "out", label: "Out of stock" },
      ])}
      {filter("categoryId", "Categories", categories)}
      {filter("warehouseId", "Warehouses", warehouses)}
      {filter("inactive", "Products", [{ value: "1", label: "Include inactive" }])}
    </FilterBar>
  );
}

interface ProductListProps {
  rows: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  canCreate: boolean;
}

export function ProductList({ rows, total, page, pageSize, canCreate }: ProductListProps) {
  const router = useRouter();
  const query = useUrlQuery();

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("sku", {
          header: "SKU",
          enableSorting: false,
          cell: ({ row }) => (
            <div>
              <p className="font-mono text-xs font-medium">{row.original.sku}</p>
              <p className="font-mono text-xs text-muted-foreground">{row.original.code}</p>
            </div>
          ),
        }),
        col.accessor("name", {
          header: "Product",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <Link
                href={`/inventory/products/${row.original.id}`}
                className="font-medium hover:underline"
                onClick={(event) => event.stopPropagation()}
              >
                {row.original.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {[row.original.category, row.original.brand].filter(Boolean).join(" · ")}
                {row.original.isActive ? "" : " · Inactive"}
              </p>
            </div>
          ),
        }),
        col.accessor("onHand", {
          header: () => <span className="block text-right">Current stock</span>,
          enableSorting: false,
          cell: ({ row }) => (
            <span className="block text-right whitespace-nowrap" data-numeric>
              {row.original.onHand} {row.original.unit}
            </span>
          ),
        }),
        col.accessor("status", {
          header: "Stock",
          enableSorting: false,
          cell: ({ row }) => (
            <div>
              <StatusBadge tone={STOCK_STATUS_TONES[row.original.status]}>
                {STOCK_STATUS_LABELS[row.original.status]}
              </StatusBadge>
              <p className="mt-1 text-xs text-muted-foreground">
                Min. {row.original.minimum}
                {row.original.shortfall ? ` · reorder ${row.original.shortfall}` : ""}
              </p>
            </div>
          ),
        }),
        col.accessor("purchasePrice", {
          header: () => <span className="block text-right">Purchase price</span>,
          enableSorting: false,
          cell: ({ getValue }) => (
            <span className="block text-right whitespace-nowrap" data-numeric>
              {getValue()}
            </span>
          ),
        }),
        col.accessor("sellingPrice", {
          header: () => <span className="block text-right">Selling price</span>,
          enableSorting: false,
          cell: ({ getValue }) => (
            <span className="block text-right whitespace-nowrap" data-numeric>
              {getValue()}
            </span>
          ),
        }),
        col.accessor("supplier", {
          header: "Supplier",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
        }),
      ]),
    [],
  );

  return (
    <div className="space-y-4">
      <DataTable
        caption="Products"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(`/inventory/products/${row.original.id}`)}
        emptyState={
          query.hasAny(FILTER_KEYS) ? (
            <EmptyState
              size="compact"
              title="No matching products"
              description="Try other search terms or filters."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={Package}
              title="No products yet"
              description="Add the products you stock, then record stock in or receive a purchase order."
              action={
                canCreate ? (
                  <Button asChild size="sm">
                    <Link href="/inventory/products/new">
                      <Plus aria-hidden="true" />
                      Add product
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
