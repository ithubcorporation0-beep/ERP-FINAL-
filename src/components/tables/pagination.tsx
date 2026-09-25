"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total number of records across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** Shows a "Rows per page" selector when provided. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
}

export function pageRange(page: number, pageSize: number, total: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  return { pageCount, current, from, to };
}

/** Server-friendly pagination: the parent owns `page`/`pageSize` and fetches the matching slice. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: PaginationProps) {
  const sizeId = useId();
  const { pageCount, current, from, to } = pageRange(page, pageSize, total);
  const numberFormat = new Intl.NumberFormat();

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-col-reverse gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p aria-live="polite" data-numeric>
        {total === 0
          ? "No records"
          : `Showing ${numberFormat.format(from)}–${numberFormat.format(to)} of ${numberFormat.format(total)}`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <label htmlFor={sizeId} className="whitespace-nowrap">
              Rows per page
            </label>
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger id={sizeId} size="sm" className="w-18">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <span className="whitespace-nowrap text-foreground" data-numeric>
          Page {current} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => onPageChange(1)}
            disabled={current <= 1}
            aria-label="First page"
          >
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(current - 1)}
            disabled={current <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(current + 1)}
            disabled={current >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            className="hidden sm:inline-flex"
            onClick={() => onPageChange(pageCount)}
            disabled={current >= pageCount}
            aria-label="Last page"
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}
