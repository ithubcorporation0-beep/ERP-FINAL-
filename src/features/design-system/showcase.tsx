"use client";

/**
 * Development-only gallery of the design system (`/design-system`, 404 in production).
 * Everything here is illustrative sample content — it is not connected to any data or action.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import type { SortingState } from "@tanstack/react-table";
import {
  CircleDollarSign,
  FileText,
  MoreHorizontal,
  Plus,
  Receipt,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DatePicker } from "@/components/forms/date-picker";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { KpiCard, KpiCardSkeleton } from "@/components/shared/kpi-card";
import { LoadingState } from "@/components/shared/loading-state";
import { Modal } from "@/components/shared/modal";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { CardSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { SuccessMessage } from "@/components/shared/success-message";
import { DataTable } from "@/components/tables/data-table";
import { DataTableColumnHeader } from "@/components/tables/data-table-column-header";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";

type SampleStatus = "Paid" | "Sent" | "Overdue" | "Draft" | "Void";
interface SampleRow {
  id: string;
  number: string;
  customer: string;
  issued: string;
  amount: number;
  status: SampleStatus;
}

const STATUS_TONE: Record<SampleStatus, StatusTone> = {
  Paid: "success",
  Sent: "info",
  Overdue: "danger",
  Draft: "neutral",
  Void: "warning",
};

const CUSTOMERS = ["Acme Trading", "Northwind Ltd", "Blue Harbor Co", "Summit Systems", "Globex Retail"];
const STATUSES: SampleStatus[] = ["Paid", "Sent", "Overdue", "Draft", "Void"];
const SAMPLE_ROWS: SampleRow[] = Array.from({ length: 23 }, (_, index) => ({
  id: String(index + 1),
  number: `SAMPLE-${String(index + 1).padStart(4, "0")}`,
  customer: CUSTOMERS[index % CUSTOMERS.length] ?? "Sample",
  issued: `2026-0${(index % 9) + 1}-1${index % 9}`,
  amount: 250 + ((index * 7919) % 9000),
  status: STATUSES[index % STATUSES.length] ?? "Draft",
}));

const STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All statuses" },
  ...STATUSES.map((status) => ({ value: status, label: status })),
];

const col = createDataTableColumns<SampleRow>();
const columns = col.columns([
  col.accessor("number", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Number" />,
    cell: ({ row }) => <span className="font-mono text-[0.8125rem] font-medium">{row.original.number}</span>,
  }),
  col.accessor("customer", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
  }),
  col.accessor("issued", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Issued" />,
  }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: ({ row }) => (
      <StatusBadge tone={STATUS_TONE[row.original.status]}>{row.original.status}</StatusBadge>
    ),
  }),
  col.accessor("amount", {
    header: ({ column }) => (
      <div className="flex justify-end">
        <DataTableColumnHeader column={column} title="Amount" className="mr-0 -ml-0" />
      </div>
    ),
    cell: ({ row }) => <div className="text-right font-medium">{formatCurrency(row.original.amount)}</div>,
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.number}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Sample actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => toast.info(`Sample: would open ${row.original.number}`)}>
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => toast.info("Sample: would ask for confirmation")}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    ),
  }),
]);

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TableDemo() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [mode, setMode] = useState<"data" | "loading" | "empty" | "error">("data");

  const filtered = useMemo(
    () =>
      SAMPLE_ROWS.filter(
        (row) =>
          (status === "all" || row.status === status) &&
          `${row.number} ${row.customer}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [search, status],
  );
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-3">
      <FilterBar
        search={
          <SearchInput
            placeholder="Search number or customer…"
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
        }
        onReset={() => {
          setStatus("all");
          setPage(1);
        }}
        resetDisabled={status === "all"}
        actions={
          <SelectInput
            aria-label="Table state"
            value={mode}
            onValueChange={(value) => setMode(value as typeof mode)}
            options={[
              { value: "data", label: "State: with data" },
              { value: "loading", label: "State: loading" },
              { value: "empty", label: "State: empty" },
              { value: "error", label: "State: error" },
            ]}
          />
        }
      >
        <SelectInput
          aria-label="Filter by status"
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
        />
      </FilterBar>
      <DataTable
        caption="Sample invoices"
        columns={columns}
        data={mode === "empty" ? [] : pageRows}
        sorting={sorting}
        onSortingChange={setSorting}
        isLoading={mode === "loading"}
        error={mode === "error" ? "Sample error: the records could not be loaded." : null}
        onRetry={() => setMode("data")}
        getRowId={(row) => row.id}
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={mode === "empty" ? 0 : filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}

const sampleFormSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters."),
  category: z.string().min(1, "Choose a category."),
  dueDate: z.date({ error: "Pick a due date." }),
  notes: z.string().max(200, "Keep notes under 200 characters.").optional(),
});
type SampleForm = z.infer<typeof sampleFormSchema>;

function FormDemo() {
  const [open, setOpen] = useState(false);
  const form = useForm<SampleForm>({
    resolver: zodResolver(sampleFormSchema),
    defaultValues: { name: "", category: "", notes: "" },
  });

  function onSubmit(values: SampleForm) {
    toast.success(`Sample only — nothing was saved (${values.name}).`);
    form.reset();
    setOpen(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Sample form"
      description="Validation runs as you submit. Nothing is saved."
      trigger={
        <Button>
          <Plus aria-hidden="true" />
          Open form modal
        </Button>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="sample-form">
            Save
          </Button>
        </>
      }
    >
      <form id="sample-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            label="Name"
            required
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="category"
            label="Category"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  { value: "services", label: "Services" },
                  { value: "hardware", label: "Hardware" },
                  { value: "licenses", label: "Licenses" },
                ]}
              />
            )}
          />
          <FormField
            control={form.control}
            name="dueDate"
            label="Due date"
            required
            render={({ field, control }) => (
              <DatePicker
                {...control}
                className="sm:w-full"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            label="Notes"
            description="Optional, up to 200 characters."
            render={({ field, control }) => <Textarea rows={3} {...field} {...control} />}
          />
        </FieldGroup>
      </form>
    </Modal>
  );
}

export function DesignSystemShowcase() {
  const [date, setDate] = useState<Date | undefined>();

  return (
    <div className="space-y-12">
      <PageHeader
        title="Design system"
        description="Reference for every shared component. Development only — all content on this page is sample data."
        actions={<FormDemo />}
      />

      <Alert>
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>Sample content</AlertTitle>
        <AlertDescription>
          This page is not available in production and none of its buttons change real data.
        </AlertDescription>
      </Alert>

      <Section
        title="Typography"
        description="Geist Sans for UI, Geist Mono for codes. Numbers use tabular figures."
      >
        <Card className="gap-3 p-6 shadow-xs">
          <p className="text-2xl font-semibold tracking-tight">Page title — text-2xl / semibold</p>
          <p className="text-lg font-semibold tracking-tight">Section title — text-lg / semibold</p>
          <p className="text-sm">Body — text-sm. The default size for dense business screens.</p>
          <p className="text-sm text-muted-foreground">Secondary — text-sm / muted-foreground</p>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Label — text-xs / uppercase
          </p>
          <p className="font-mono text-sm">INV-2026-0042 — font-mono</p>
        </Card>
      </Section>

      <Section
        title="Status badges"
        description="Five tones. The label always carries the meaning; color only reinforces it."
      >
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="success">Paid</StatusBadge>
          <StatusBadge tone="info">Sent</StatusBadge>
          <StatusBadge tone="warning">Pending approval</StatusBadge>
          <StatusBadge tone="danger">Overdue</StatusBadge>
          <StatusBadge tone="neutral">Draft</StatusBadge>
          <StatusBadge tone="neutral" dot={false}>
            No dot
          </StatusBadge>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section
        title="KPI cards"
        description="Values are samples. Real dashboards pass preformatted figures from services."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Sample revenue"
            value={formatCurrency(48250)}
            icon={CircleDollarSign}
            change={{ value: "12.4%", direction: "up", sentiment: "positive", label: "vs last month" }}
          />
          <KpiCard
            label="Sample receivables"
            value={formatCurrency(12900)}
            icon={Receipt}
            change={{ value: "3.1%", direction: "down", sentiment: "positive", label: "vs last month" }}
          />
          <KpiCard
            label="Sample overdue"
            value="7"
            icon={FileText}
            change={{ value: "2", direction: "up", sentiment: "negative", label: "vs last week" }}
          />
          <KpiCardSkeleton />
        </div>
      </Section>

      <Section
        title="Data table"
        description="Sorting, filtering, pagination and every state. Switch states with the selector."
      >
        <TableDemo />
      </Section>

      <Section title="Form controls">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput onSearch={(value) => toast(`Search: "${value}"`)} />
          <SelectInput
            aria-label="Sample select"
            options={STATUS_OPTIONS}
            value="all"
            onValueChange={() => undefined}
          />
          <DatePicker value={date} onChange={setDate} aria-describedby={undefined} />
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
                <CardDescription>Tab panels hold related detail views.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Sample panel content.</CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="activity">
            <EmptyState size="compact" title="No activity" description="Sample empty tab." />
          </TabsContent>
          <TabsContent value="documents">
            <LoadingState label="Loading documents…" />
          </TabsContent>
        </Tabs>
      </Section>

      <Section title="Feedback" description="Toasts for transient results; inline states for page content.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => toast.success("Sample success toast")}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast.error("Sample error toast")}>
            Error toast
          </Button>
          <Button variant="outline" onClick={() => toast.warning("Sample warning toast")}>
            Warning toast
          </Button>
          <Button variant="outline" onClick={() => toast.info("Sample info toast")}>
            Info toast
          </Button>
          <ConfirmButton
            label="Confirm dialog"
            title="Delete sample record?"
            description="Sample only. The confirm button waits 1 second to show the pending state."
            confirmLabel="Delete"
            onConfirm={() =>
              new Promise<void>((resolve) => {
                setTimeout(() => {
                  toast.success("Sample only — nothing was deleted.");
                  resolve();
                }, 1000);
              })
            }
          />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <SuccessMessage message="Sample success message after a completed action." />
          <ErrorState
            message="Sample error message with a retry action."
            onRetry={() => toast("Retry clicked")}
          />
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Sample empty state with a call to action."
            action={<Button variant="outline">Sample action</Button>}
          />
          <div className="space-y-4">
            <LoadingState />
            <CardSkeleton />
          </div>
        </div>
      </Section>

      <Section title="Skeleton loaders">
        <TableSkeleton rows={3} />
      </Section>
    </div>
  );
}
