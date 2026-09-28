"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES } from "@/config/accounting";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import { checkEntry, ENTRY_PROBLEM_MESSAGES } from "@/lib/accounting";
import { formatMoney } from "@/lib/format";
import { money, subtractMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { journalEntrySchema, type JournalEntryInput } from "@/lib/validation";
import { createTransactionAction } from "@/server/actions/accounting.actions";

const FIELDS = ["type", "entryDate", "description", "reference", "lines"] as const;
const EMPTY_LINE = { accountId: "", debit: "", credit: "", description: "" };

/** Exact amount of a field while typing; incomplete input ("12.") counts as 0 until valid. */
function safeMoney(value: string | undefined): string {
  try {
    return money(value || "0");
  } catch {
    // Shown as 0 while typing; the schema reports the invalid amount on submit.
    return "0.00";
  }
}

interface TransactionFormProps {
  accounts: SelectOption[];
  today: string;
  locale: string;
  currency: string;
}

/**
 * A manual journal entry. Totals are recomputed exactly while typing; the server checks the same double-entry rule
 * (checkEntry) and the database refuses unbalanced entries.
 */
export function TransactionForm({ accounts, today, locale, currency }: TransactionFormProps) {
  const router = useRouter();
  const form = useForm<JournalEntryInput>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      type: "PAYMENT",
      entryDate: today,
      description: "",
      reference: "",
      lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const lines = useWatch({ control: form.control, name: "lines" }) ?? [];
  const amounts = lines.map((line) => ({ debit: safeMoney(line?.debit), credit: safeMoney(line?.credit) }));
  const debits = sumMoney(amounts.map((line) => line.debit));
  const credits = sumMoney(amounts.map((line) => line.credit));
  const difference = subtractMoney(debits, credits);
  const check = checkEntry(amounts);
  const show = (value: string) => formatMoney(value, { locale, currency });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: JournalEntryInput) {
    const result = await createTransactionAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    if (!result.data) return;
    toast.success("Transaction posted.");
    router.push(`/finance/transactions/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <FormField
            control={form.control}
            name="type"
            label="Type"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="entryDate"
            label="Date"
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="description"
            label="Description"
            required
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="reference"
            label="Reference"
            description="Optional, e.g. a bank statement line or a vendor invoice number."
            render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
          />
        </div>
      </FieldGroup>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Lines</legend>
        {fields.map((item, index) => {
          const lineErrors = errors.lines?.[index];
          return (
            <div
              key={item.id}
              className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,2fr)_8rem_8rem_minmax(0,1.5fr)_auto] md:items-start"
            >
              <FormField
                control={form.control}
                name={`lines.${index}.accountId`}
                label={`Line ${index + 1} account`}
                required
                render={({ field, control }) => (
                  <SelectInput
                    {...control}
                    className="sm:w-full"
                    placeholder="Choose an account"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={accounts}
                  />
                )}
              />
              <FormField
                control={form.control}
                name={`lines.${index}.debit`}
                label="Debit"
                render={({ field, control }) => (
                  <Input inputMode="decimal" placeholder="0.00" {...field} {...control} />
                )}
              />
              <FormField
                control={form.control}
                name={`lines.${index}.credit`}
                label="Credit"
                render={({ field, control }) => (
                  <Input inputMode="decimal" placeholder="0.00" {...field} {...control} />
                )}
              />
              <FormField
                control={form.control}
                name={`lines.${index}.description`}
                label="Line note"
                render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="md:mt-6"
                disabled={fields.length <= 2}
                onClick={() => remove(index)}
                aria-label={`Remove line ${index + 1}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
              {lineErrors?.root?.message ? (
                <p role="alert" className="text-sm text-danger md:col-span-5">
                  {lineErrors.root.message}
                </p>
              ) : null}
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fields.length >= 100}
          onClick={() => append({ ...EMPTY_LINE })}
        >
          <Plus aria-hidden="true" />
          Add line
        </Button>
        {errors.lines?.message ? (
          <p role="alert" className="text-sm text-danger">
            {errors.lines.message}
          </p>
        ) : null}
      </fieldset>

      <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-sm" aria-live="polite">
        <dt>Total debits</dt>
        <dd className="text-right" data-numeric>
          {show(debits)}
        </dd>
        <dt>Total credits</dt>
        <dd className="text-right" data-numeric>
          {show(credits)}
        </dd>
        <dt>Difference</dt>
        <dd className={cn("text-right font-medium", check.ok ? "text-success" : "text-danger")} data-numeric>
          {show(difference)}
        </dd>
        <dd className={cn("col-span-2", check.ok ? "text-success" : "text-muted-foreground")}>
          {check.ok ? "Balanced — ready to post." : ENTRY_PROBLEM_MESSAGES[check.problem]}
        </dd>
      </dl>

      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Post transaction
        </Button>
        <Button asChild variant="outline">
          <Link href="/finance/transactions">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
