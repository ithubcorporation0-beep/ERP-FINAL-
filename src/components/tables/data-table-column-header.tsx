"use client";

import type { CellData, Column, RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataTableFeatures } from "./data-table-features";

interface DataTableColumnHeaderProps<TData extends RowData, TValue extends CellData> {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
  className?: string;
}

/** Clickable, keyboard-accessible sort toggle for a DataTable column header. */
export function DataTableColumnHeader<TData extends RowData, TValue extends CellData>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>;

  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        "-ml-2 inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-medium tracking-wide uppercase hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        sorted && "text-foreground",
        className,
      )}
    >
      {title}
      <Icon className={cn("size-3.5", !sorted && "opacity-50")} aria-hidden="true" />
      <span className="sr-only">
        {sorted === "asc" ? ", sorted ascending" : sorted === "desc" ? ", sorted descending" : ", sortable"}
      </span>
    </button>
  );
}
