"use client";

import { IdCard, Plus } from "lucide-react";
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
import { EMPLOYMENT_STATUS_LABELS, EMPLOYMENT_STATUSES, type EmploymentStatusKey } from "@/config/hr";
import { useUrlQuery } from "@/hooks/use-url-query";
import { EmployeeAvatar } from "./employee-avatar";
import { EMPLOYMENT_STATUS_TONES } from "./labels";

export interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  position: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  /** Preformatted in the company's locale. */
  joiningDate: string;
  status: EmploymentStatusKey;
  photoUrl: string | null;
}

interface EmployeeListProps {
  rows: EmployeeRow[];
  total: number;
  page: number;
  pageSize: number;
  departments: SelectOption[];
  canCreate: boolean;
}

const FILTER_KEYS = ["search", "status", "departmentId"] as const;
const ALL = "all";
const col = createDataTableColumns<EmployeeRow>();

export function EmployeeList({ rows, total, page, pageSize, departments, canCreate }: EmployeeListProps) {
  const router = useRouter();
  const query = useUrlQuery();
  const filtered = query.hasAny(FILTER_KEYS);

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("code", {
          header: "Employee ID",
          enableSorting: false,
          cell: ({ getValue }) => <span className="font-mono text-xs">{getValue()}</span>,
        }),
        col.accessor("name", {
          header: "Name",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="flex min-w-0 items-center gap-3">
              <EmployeeAvatar name={row.original.name} photoUrl={row.original.photoUrl} />
              <div className="min-w-0">
                <Link
                  href={`/hr/employees/${row.original.id}`}
                  className="font-medium hover:underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  {row.original.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{row.original.position ?? ""}</p>
              </div>
            </div>
          ),
        }),
        col.accessor("department", {
          header: "Department",
          enableSorting: false,
          cell: ({ getValue }) => getValue() ?? "—",
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
        col.accessor("joiningDate", { header: "Joined", enableSorting: false }),
        col.accessor("status", {
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={EMPLOYMENT_STATUS_TONES[row.original.status]}>
              {EMPLOYMENT_STATUS_LABELS[row.original.status]}
            </StatusBadge>
          ),
        }),
      ]),
    [],
  );

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
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput
            label="Search employees"
            placeholder="Search name, email, position or ID…"
            defaultValue={query.get("search")}
            onSearch={(value) => query.set({ search: value })}
            className="sm:w-80"
          />
        }
        onReset={
          filtered ? () => query.set(Object.fromEntries(FILTER_KEYS.map((key) => [key, null]))) : undefined
        }
      >
        {filter("status", "Statuses", [
          { value: "current", label: "Current staff" },
          ...EMPLOYMENT_STATUSES.map((status) => ({
            value: status,
            label: EMPLOYMENT_STATUS_LABELS[status],
          })),
        ])}
        {filter("departmentId", "Departments", departments)}
      </FilterBar>
      <DataTable
        caption="Employees"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(`/hr/employees/${row.original.id}`)}
        emptyState={
          filtered ? (
            <EmptyState
              size="compact"
              title="Nothing matches"
              description="Try other search terms or filters."
            />
          ) : (
            <EmptyState
              size="compact"
              icon={IdCard}
              title="No employees yet"
              description="Add your team to track attendance and leave."
              action={
                canCreate ? (
                  <Button asChild size="sm">
                    <Link href="/hr/employees/new">
                      <Plus aria-hidden="true" />
                      Add employee
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
