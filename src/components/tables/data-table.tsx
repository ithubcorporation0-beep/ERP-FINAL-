"use client";

import { useTable, type OnChangeFn, type Row, type RowData, type SortingState } from "@tanstack/react-table";
import { useState } from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { dataTableFeatures, type DataTableColumns, type DataTableFeatures } from "./data-table-features";

const NO_SORTING: SortingState = [];

export interface DataTableProps<TData extends RowData> {
  /** Build with `createDataTableColumns<T>()`; keep the array stable (module scope or useMemo). */
  columns: DataTableColumns<TData>;
  data: TData[];
  /** Describes the table for screen readers (visually hidden). */
  caption: string;
  isLoading?: boolean;
  /** When set, replaces the rows with an error message (and a retry button if `onRetry` is given). */
  error?: string | null;
  onRetry?: () => void;
  /** Shown when `data` is empty. Defaults to a generic "No results" message. */
  emptyState?: React.ReactNode;
  /** Controlled sorting. Omit to let the table sort the current page client-side. */
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** `true` when the server sorts the data (pair with `sorting` + `onSortingChange`). */
  manualSorting?: boolean;
  getRowId?: (row: TData, index: number) => string;
  onRowClick?: (row: Row<DataTableFeatures, TData>) => void;
  loadingRows?: number;
  className?: string;
}

/**
 * Accessible, responsive table on TanStack Table with built-in loading, empty and error states.
 * Pair with `FilterBar` above and `Pagination` below. Scrolls horizontally on small screens.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  caption,
  isLoading,
  error,
  onRetry,
  emptyState,
  sorting: controlledSorting,
  onSortingChange,
  manualSorting,
  getRowId,
  onRowClick,
  loadingRows = 5,
  className,
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>(NO_SORTING);

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    // One owner per state slice: the parent (controlled) or this component.
    state: { sorting: controlledSorting ?? internalSorting },
    onSortingChange: onSortingChange ?? setInternalSorting,
    manualSorting,
    getRowId,
  });

  const columnCount = table.getAllLeafColumns().length;
  const rows = table.getRowModel().rows;

  function body() {
    if (error) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columnCount} className="p-4 whitespace-normal">
            <ErrorState message={error} onRetry={onRetry} />
          </TableCell>
        </TableRow>
      );
    }
    if (isLoading) {
      return Array.from({ length: loadingRows }, (_, rowIndex) => (
        <TableRow key={`loading-${rowIndex}`} aria-hidden="true" className="hover:bg-transparent">
          {Array.from({ length: columnCount }, (_, cellIndex) => (
            <TableCell key={cellIndex} className="py-3.5">
              <Skeleton className="h-4 w-full max-w-40" />
            </TableCell>
          ))}
        </TableRow>
      ));
    }
    if (rows.length === 0) {
      return (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columnCount} className="whitespace-normal">
            {emptyState ?? (
              <EmptyState
                size="compact"
                title="No results"
                description="Try adjusting your search or filters."
              />
            )}
          </TableCell>
        </TableRow>
      );
    }
    return rows.map((row) => (
      <TableRow
        key={row.id}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        className={cn(onRowClick && "cursor-pointer")}
      >
        {row.getAllCells().map((cell) => (
          <TableCell key={cell.id} className="py-3">
            <table.FlexRender cell={cell} />
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div
      className={cn("overflow-hidden rounded-xl border bg-card shadow-xs", className)}
      aria-busy={isLoading}
    >
      <Table>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader className="bg-muted/50">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                          ? "descending"
                          : header.column.getCanSort()
                            ? "none"
                            : undefined
                    }
                    className="h-10 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>{body()}</TableBody>
      </Table>
    </div>
  );
}
