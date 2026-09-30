"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { payrollRunSchema, type PayrollRunInput } from "@/lib/validation";
import { processPayrollAction } from "@/server/actions/payroll.actions";

/**
 * Processes a month: one payslip per employee from their salary structure. The server refuses a month that
 * already has a payroll, so a double click or a second tab can't create two.
 */
export function ProcessPayrollForm({ defaults }: { defaults: PayrollRunInput }) {
  const router = useRouter();
  const form = useForm<PayrollRunInput>({ resolver: zodResolver(payrollRunSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: PayrollRunInput) {
    const result = await processPayrollAction(values);
    if (!result.ok) return applyActionError(form.setError, result, ["period", "payDate", "notes"]);
    if (!result.data) return;
    toast.success(`Payroll processed for ${result.data.employees} employees.`);
    if (result.data.skipped.length > 0) {
      toast.warning(`Skipped (no basic salary): ${result.data.skipped.join(", ")}`);
    }
    router.push(`/payroll/runs/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <FormField
            control={form.control}
            name="period"
            label="Payroll month"
            required
            render={({ field, control }) => <Input type="month" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="payDate"
            label="Pay date"
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="notes"
            label="Notes"
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </div>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Process payroll
        </Button>
        <Button asChild variant="outline">
          <Link href="/payroll/runs">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
