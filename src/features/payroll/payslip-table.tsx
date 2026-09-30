"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileDown, Loader2, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { EmptyState } from "@/components/shared/empty-state";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYROLL_LINE_LABELS } from "@/config/payroll";
import { FormStatus } from "@/features/auth/form-status";
import { formatMoney } from "@/lib/format";
import { calculatePayroll, PayrollAmountError, type PayrollAmounts } from "@/lib/payroll";
import { payrollItemSchema, type PayrollItemInput } from "@/lib/validation";
import { updatePayrollItemAction } from "@/server/actions/payroll.actions";

const COLUMNS = ["basic", "allowances", "bonus", "overtime", "deductions", "tax", "advances", "net"] as const;
const EDITABLE = ["basic", "allowances", "bonus", "overtime", "deductions", "tax"] as const;

export interface PayslipRow {
  id: string;
  code: string;
  name: string;
  detail: string;
  partialPeriod: boolean;
  note: string | null;
  /** Exact decimal strings. */
  amounts: PayrollAmounts & { net: string };
}

interface PayslipTableProps {
  runId: string;
  rows: PayslipRow[];
  totals: PayrollAmounts & { net: string };
  currency: string;
  locale: string;
  canEdit: boolean;
  /** Slips can be downloaded unless the run is cancelled. */
  slips: boolean;
}

/** The payslips of a run; drafts can be adjusted one by one. */
export function PayslipTable({ runId, rows, totals, currency, locale, canEdit, slips }: PayslipTableProps) {
  const show = (value: string) => formatMoney(value, { locale, currency }) ?? value;
  if (rows.length === 0) {
    return (
      <EmptyState
        size="compact"
        title="No payslips"
        description="Recalculate to include eligible employees."
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableCaption className="sr-only">Payslips</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column} className="text-right whitespace-nowrap">
                {PAYROLL_LINE_LABELS[column]}
              </TableHead>
            ))}
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{row.code}</span>
                  {row.detail ? ` · ${row.detail}` : ""}
                </p>
                {row.partialPeriod ? (
                  <p className="text-xs text-warning">Joined or left this month — check the basic salary.</p>
                ) : null}
                {row.note ? <p className="text-xs text-muted-foreground">{row.note}</p> : null}
              </TableCell>
              {COLUMNS.map((column) => (
                <TableCell
                  key={column}
                  className={
                    column === "net"
                      ? "text-right font-semibold whitespace-nowrap"
                      : "text-right whitespace-nowrap"
                  }
                  data-numeric
                >
                  {show(row.amounts[column])}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex justify-end gap-1">
                  {canEdit ? <PayslipEditDialog runId={runId} row={row} show={show} /> : null}
                  {slips ? (
                    <Button asChild variant="ghost" size="icon-sm">
                      <a
                        href={`/api/payroll/${runId}/items/${row.id}/slip?download=1`}
                        aria-label={`Download salary slip of ${row.name}`}
                      >
                        <FileDown />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total ({rows.length})</TableCell>
            {COLUMNS.map((column) => (
              <TableCell key={column} className="text-right whitespace-nowrap" data-numeric>
                {show(totals[column])}
              </TableCell>
            ))}
            <TableCell />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/** Live net with the same formula the server applies; incomplete input shows no figure until valid. */
function preview(values: Partial<PayrollItemInput>, advances: string): string | null {
  try {
    return calculatePayroll({
      basic: values.basic ?? "0",
      allowances: values.allowances ?? "0",
      bonus: values.bonus ?? "0",
      overtime: values.overtime ?? "0",
      deductions: values.deductions ?? "0",
      tax: values.tax ?? "0",
      advances,
    }).net;
  } catch (error) {
    // While typing ("12.") the amount is invalid; the form's validation reports it on save.
    if (error instanceof PayrollAmountError) return null;
    throw error;
  }
}

function PayslipEditDialog({
  runId,
  row,
  show,
}: {
  runId: string;
  row: PayslipRow;
  show: (value: string) => string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults: PayrollItemInput = {
    basic: row.amounts.basic,
    allowances: row.amounts.allowances,
    bonus: row.amounts.bonus,
    overtime: row.amounts.overtime,
    deductions: row.amounts.deductions,
    tax: row.amounts.tax,
    note: row.note ?? "",
  };
  const form = useForm<PayrollItemInput>({
    resolver: zodResolver(payrollItemSchema),
    defaultValues: defaults,
  });
  const values = useWatch({ control: form.control });
  const net = preview(values, row.amounts.advances);
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(input: PayrollItemInput) {
    const result = await updatePayrollItemAction(runId, row.id, input);
    if (!result.ok) return applyActionError(form.setError, result, [...EDITABLE, "note"]);
    toast.success(`Payslip of ${row.name} updated.`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(defaults);
      }}
      title={`Adjust payslip — ${row.name}`}
      description="Advances come from recorded salary advances and can't be typed in."
      trigger={
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Adjust payslip of ${row.name}`}>
          <Pencil />
        </Button>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            {EDITABLE.map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                label={PAYROLL_LINE_LABELS[name]}
                render={({ field, control }) => <Input inputMode="decimal" {...field} {...control} />}
              />
            ))}
          </div>
          <FormField
            control={form.control}
            name="note"
            label="Note on the slip"
            render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
          />
        </FieldGroup>
        <dl className="grid grid-cols-2 gap-1 text-sm" aria-live="polite">
          <dt className="text-muted-foreground">Advances recovered</dt>
          <dd className="text-right" data-numeric>
            {show(row.amounts.advances)}
          </dd>
          <dt className="font-medium">Net salary</dt>
          <dd
            className={
              net && net.startsWith("-") ? "text-right font-semibold text-danger" : "text-right font-semibold"
            }
            data-numeric
          >
            {net === null ? "—" : show(net)}
          </dd>
        </dl>
        <FormStatus tone="error" message={errors.root?.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save payslip
          </Button>
        </div>
      </form>
    </Modal>
  );
}
