"use client";

import {
  ArrowLeftRight,
  ArrowRightLeft,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  HandCoins,
  Plus,
  Receipt,
  ReceiptText,
  ShoppingCart,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { useUrlQuery } from "@/hooks/use-url-query";
import { cn } from "@/lib/utils";

/** One row of a sales list, preformatted on the server. */
export interface SalesRow {
  id: string;
  href: string;
  code: string;
  /** Secondary code, e.g. the quotation number of a sales order or the invoice of a payment. */
  reference?: string | null;
  customer: string;
  date: string;
  /** Due / expiry date, or the payment method. */
  secondary?: string | null;
  secondaryAlert?: boolean;
  amount: string;
  /** Balance for invoices. */
  balance?: string | null;
  status: { label: string; tone: StatusTone };
}

interface ListConfig {
  caption: string;
  searchLabel: string;
  searchPlaceholder: string;
  filterKey: string;
  filterLabel: string;
  filterOptions: SelectOption[];
  columns: {
    code: string;
    reference?: string;
    /** Header of the "customer" column (e.g. "Employee" for expenses, "Period" for payroll). Defaults to "Customer". */
    party?: string;
    date: string;
    secondary?: string;
    amount: string;
    balance?: string;
  };
  empty: {
    title: string;
    description: string;
    createHref?: string;
    createLabel?: string;
    icon:
      | "quote"
      | "invoice"
      | "payment"
      | "expense"
      | "journal"
      | "leave"
      | "payroll"
      | "request"
      | "purchase"
      | "bill"
      | "stock";
  };
}

const ICONS = {
  quote: FileText,
  invoice: ReceiptText,
  payment: HandCoins,
  expense: Receipt,
  journal: ArrowLeftRight,
  leave: CalendarDays,
  payroll: WalletCards,
  request: ClipboardList,
  purchase: ShoppingCart,
  bill: FileSpreadsheet,
  stock: ArrowRightLeft,
} as const;
const ALL = "all";
const col = createDataTableColumns<SalesRow>();

interface SalesListProps {
  config: ListConfig;
  rows: SalesRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * List with search, one filter, pagination and loading/empty states — shared by quotations, orders, invoices,
 * payments, expenses, transactions, leave requests, payroll runs, stock movements and purchasing documents.
 */
export function SalesList({ config, rows, total, page, pageSize }: SalesListProps) {
  const router = useRouter();
  const query = useUrlQuery();
  const filtered = query.hasAny(["search", config.filterKey]);
  const Icon = ICONS[config.empty.icon];

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("code", {
          header: config.columns.code,
          enableSorting: false,
          cell: ({ row }) => (
            <Link
              href={row.original.href}
              className="font-mono text-xs font-medium hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.code}
            </Link>
          ),
        }),
        ...(config.columns.reference
          ? [
              col.accessor("reference", {
                header: config.columns.reference,
                enableSorting: false,
                cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() ?? "—"}</span>,
              }),
            ]
          : []),
        col.accessor("customer", { header: config.columns.party ?? "Customer", enableSorting: false }),
        col.accessor("date", { header: config.columns.date, enableSorting: false }),
        ...(config.columns.secondary
          ? [
              col.accessor("secondary", {
                header: config.columns.secondary,
                enableSorting: false,
                cell: ({ row }) => (
                  <span className={cn(row.original.secondaryAlert && "font-medium text-danger")}>
                    {row.original.secondary ?? "—"}
                  </span>
                ),
              }),
            ]
          : []),
        col.accessor("amount", {
          header: () => <span className="block text-right">{config.columns.amount}</span>,
          enableSorting: false,
          cell: ({ getValue }) => (
            <span className="block text-right whitespace-nowrap" data-numeric>
              {getValue()}
            </span>
          ),
        }),
        ...(config.columns.balance
          ? [
              col.accessor("balance", {
                header: () => <span className="block text-right">{config.columns.balance}</span>,
                enableSorting: false,
                cell: ({ getValue }) => (
                  <span className="block text-right whitespace-nowrap" data-numeric>
                    {getValue() ?? "—"}
                  </span>
                ),
              }),
            ]
          : []),
        col.accessor("status", {
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={row.original.status.tone}>{row.original.status.label}</StatusBadge>
          ),
        }),
      ]),
    [config],
  );

  return (
    <div className="space-y-4">
      <FilterBar
        search={
          <SearchInput
            label={config.searchLabel}
            placeholder={config.searchPlaceholder}
            defaultValue={query.get("search")}
            onSearch={(value) => query.set({ search: value })}
            className="sm:w-80"
          />
        }
        onReset={filtered ? () => query.set({ search: null, [config.filterKey]: null }) : undefined}
      >
        <SelectInput
          aria-label={config.filterLabel}
          className="sm:w-48"
          value={query.get(config.filterKey) || ALL}
          onValueChange={(value) => query.set({ [config.filterKey]: value === ALL ? null : value })}
          options={[
            { value: ALL, label: `All ${config.filterLabel.toLowerCase()}` },
            ...config.filterOptions,
          ]}
        />
      </FilterBar>
      <DataTable
        caption={config.caption}
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={query.pending}
        onRowClick={(row) => router.push(row.original.href)}
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
              icon={Icon}
              title={config.empty.title}
              description={config.empty.description}
              action={
                config.empty.createHref ? (
                  <Button asChild size="sm">
                    <Link href={config.empty.createHref}>
                      <Plus aria-hidden="true" />
                      {config.empty.createLabel}
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
