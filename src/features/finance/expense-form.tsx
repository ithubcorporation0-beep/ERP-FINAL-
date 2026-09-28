"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_PAYMENT_METHODS,
} from "@/config/accounting";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import { apiErrorMessage } from "@/lib/api-client";
import { expenseSchema, type ExpenseInput } from "@/lib/validation";
import { createExpenseAction, updateExpenseAction } from "@/server/actions/expense.actions";

const FIELDS = [
  "category",
  "amount",
  "expenseDate",
  "vendor",
  "paymentMethod",
  "description",
  "employeeId",
] as const;
const SELF = "self";

interface ExpenseFormProps {
  expenseId?: string;
  defaults: ExpenseInput;
  /** Members the expense can be filed for — only offered to approvers. */
  employees: SelectOption[];
  currency: string;
}

/** Submit or correct an expense. A receipt chosen here is uploaded right after saving. */
export function ExpenseForm({ expenseId, defaults, employees, currency }: ExpenseFormProps) {
  const router = useRouter();
  const receiptId = useId();
  const [receipt, setReceipt] = useState<File | null>(null);
  const form = useForm<ExpenseInput>({ resolver: zodResolver(expenseSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ExpenseInput) {
    const result = expenseId
      ? await updateExpenseAction(expenseId, values)
      : await createExpenseAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    const id = expenseId ?? (result.data && "id" in result.data ? result.data.id : undefined);
    if (!id) return;
    if (receipt) {
      const body = new FormData();
      body.append("file", receipt);
      const response = await fetch(`/api/expenses/${id}/receipt`, { method: "POST", body });
      if (!response.ok)
        toast.error(`Expense saved, but the receipt failed: ${await apiErrorMessage(response, "Upload")}`);
    }
    toast.success(expenseId ? "Expense updated — waiting for approval." : "Expense submitted for approval.");
    router.push(`/finance/expenses/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
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
                options={optionsOf(EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            label={`Amount (${currency})`}
            required
            render={({ field, control }) => (
              <Input inputMode="decimal" placeholder="0.00" {...field} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="expenseDate"
            label="Date"
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="vendor"
            label="Vendor"
            render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
          />
          <FormField
            control={form.control}
            name="paymentMethod"
            label="Payment method"
            required
            description="Choose “Not paid yet” when the vendor will be paid later."
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(EXPENSE_PAYMENT_METHODS, EXPENSE_PAYMENT_METHOD_LABELS)}
              />
            )}
          />
          {employees.length > 0 ? (
            <FormField
              control={form.control}
              name="employeeId"
              label="Employee"
              description="Who incurred the expense."
              render={({ field, control }) => (
                <SelectInput
                  {...control}
                  className="sm:w-full"
                  value={field.value || SELF}
                  onValueChange={(value) => field.onChange(value === SELF ? "" : value)}
                  options={[{ value: SELF, label: "Me" }, ...employees]}
                />
              )}
            />
          ) : null}
          <FormField
            control={form.control}
            name="description"
            label="Description"
            required
            className="md:col-span-2"
            render={({ field, control }) => <Textarea rows={3} {...field} {...control} />}
          />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={receiptId}>Receipt</Label>
            <Input
              id={receiptId}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              PDF or image, up to 10 MB. Optional — you can add it later.
            </p>
          </div>
        </div>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {expenseId ? "Save and resubmit" : "Submit expense"}
        </Button>
        <Button asChild variant="outline">
          <Link href={expenseId ? `/finance/expenses/${expenseId}` : "/finance/expenses"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
