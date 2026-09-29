"use client";

import { CalendarClock, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { DAY_STATUS_LABELS, type AttendanceStatusKey } from "@/config/hr";
import { useUrlQuery } from "@/hooks/use-url-query";
import { DATE_RANGE_LABELS, DATE_RANGE_PRESETS } from "@/lib/date-range";
import { deleteAttendanceAction } from "@/server/actions/hr.actions";
import { DAY_STATUS_TONES } from "./labels";

/** One attendance record, preformatted on the server (company time zone). */
export interface AttendanceRow {
  id: string;
  date: string;
  employee: string;
  checkIn: string | null;
  checkOut: string | null;
  worked: string;
  late: string | null;
  early: string | null;
  status: AttendanceStatusKey;
  source: string;
  note: string | null;
  correctHref: string | null;
}

interface AttendanceHistoryProps {
  rows: AttendanceRow[];
  total: number;
  page: number;
  pageSize: number;
  range: string;
  /** Empty for people who see only their own attendance (no employee filter). */
  employees: SelectOption[];
  canDelete: boolean;
}

const ALL = "all";
const col = createDataTableColumns<AttendanceRow>();
const RANGE_OPTIONS = DATE_RANGE_PRESETS.map((preset) => ({
  value: preset,
  label: DATE_RANGE_LABELS[preset],
}));

export function AttendanceHistory({
  rows,
  total,
  page,
  pageSize,
  range,
  employees,
  canDelete,
}: AttendanceHistoryProps) {
  const router = useRouter();
  const query = useUrlQuery();
  const [removing, setRemoving] = useState<AttendanceRow | null>(null);
  const filtered = query.hasAny(["employeeId"]);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("date", { header: "Date", enableSorting: false }),
        ...(employees.length > 0
          ? [col.accessor("employee", { header: "Employee", enableSorting: false })]
          : []),
        col.accessor("checkIn", {
          header: "Check-in",
          enableSorting: false,
          cell: ({ row }) => (
            <span>
              {row.original.checkIn ?? "—"}
              {row.original.late ? (
                <span className="ml-1 text-xs text-warning">({row.original.late})</span>
              ) : null}
            </span>
          ),
        }),
        col.accessor("checkOut", {
          header: "Check-out",
          enableSorting: false,
          cell: ({ row }) => (
            <span>
              {row.original.checkOut ?? "—"}
              {row.original.early ? (
                <span className="ml-1 text-xs text-warning">({row.original.early})</span>
              ) : null}
            </span>
          ),
        }),
        col.accessor("worked", { header: "Worked", enableSorting: false }),
        col.accessor("status", {
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={DAY_STATUS_TONES[row.original.status]}>
              {DAY_STATUS_LABELS[row.original.status]}
            </StatusBadge>
          ),
        }),
        col.accessor("source", {
          header: "Recorded",
          enableSorting: false,
          cell: ({ row }) => (
            <span className="text-xs text-muted-foreground" title={row.original.note ?? undefined}>
              {row.original.source}
              {row.original.note ? " · note" : ""}
            </span>
          ),
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              {row.original.correctHref ? (
                <Button asChild variant="ghost" size="icon-sm">
                  <Link
                    href={row.original.correctHref}
                    aria-label={`Correct ${row.original.employee} on ${row.original.date}`}
                  >
                    <Pencil />
                  </Link>
                </Button>
              ) : null}
              {canDelete ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${row.original.employee} on ${row.original.date}`}
                  onClick={() => setRemoving(row.original)}
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ),
        }),
      ]),
    [employees.length, canDelete],
  );

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SelectInput
            aria-label="Period"
            className="sm:w-48"
            value={range}
            onValueChange={(value) => query.set({ range: value })}
            options={RANGE_OPTIONS}
          />
        }
        onReset={filtered ? () => query.set({ employeeId: null }) : undefined}
      >
        {employees.length > 0 ? (
          <SelectInput
            aria-label="Employee"
            className="sm:w-56"
            value={query.get("employeeId") || ALL}
            onValueChange={(value) => query.set({ employeeId: value === ALL ? null : value })}
            options={[{ value: ALL, label: "All employees" }, ...employees]}
          />
        ) : null}
      </FilterBar>
      <DataTable
        caption="Attendance history"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        emptyState={
          <EmptyState
            size="compact"
            icon={CalendarClock}
            title="No attendance records in this period"
            description="Check-ins appear here. Days without a record count as absent or on leave in the report."
          />
        }
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => query.set({ page: next })}
        onPageSizeChange={(size) => query.set({ pageSize: size })}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title="Delete this attendance record?"
        description={`${removing?.employee ?? ""} on ${removing?.date ?? ""}. The day will count as absent unless it is re-entered. The deletion is kept in the audit log.`}
        confirmLabel="Delete record"
        onConfirm={async () => {
          if (!removing) return;
          const result = await deleteAttendanceAction(removing.id);
          if (!result.ok) throw new Error(result.error.message);
          toast.success("Attendance record deleted.");
          setRemoving(null);
          router.refresh();
        }}
      />
    </div>
  );
}
