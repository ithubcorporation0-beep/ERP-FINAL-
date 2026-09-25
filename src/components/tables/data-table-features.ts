import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ColumnHelper,
  type RowData,
} from "@tanstack/react-table";

/**
 * TanStack Table v9 registers features explicitly. Every DataTable shares this set:
 * sorting only (pagination and filtering are done by the server / parent component).
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    datetime: sortFn_datetime,
    basic: sortFn_basic,
  },
});

export type DataTableFeatures = typeof dataTableFeatures;

/**
 * Typed column builder for a DataTable:
 *
 * ```ts
 * const col = createDataTableColumns<Invoice>();
 * const columns = col.columns([col.accessor("number", { header: "Number" }), …]);
 * ```
 * Define columns at module scope (or memoize them) so they stay stable between renders.
 */
export function createDataTableColumns<TData extends RowData>(): ColumnHelper<DataTableFeatures, TData> {
  return createColumnHelper<DataTableFeatures, TData>();
}

/** The column list produced by `createDataTableColumns<T>().columns([...])`. */
export type DataTableColumns<TData extends RowData> = ReturnType<
  ColumnHelper<DataTableFeatures, TData>["columns"]
>;
