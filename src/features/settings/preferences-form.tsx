"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { preferencesSchema, type PreferencesInput } from "@/lib/validation";
import { updatePreferencesAction } from "@/server/actions/company.actions";

const DATE_FORMATS = [
  { value: "yyyy-MM-dd", label: "2026-09-26 (ISO)" },
  { value: "dd/MM/yyyy", label: "26/09/2026" },
  { value: "MM/dd/yyyy", label: "09/26/2026" },
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
  (label, index) => ({
    value: String(index),
    label,
  }),
);

export function PreferencesForm({ defaults, readOnly }: { defaults: PreferencesInput; readOnly: boolean }) {
  const form = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: defaults,
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: PreferencesInput) {
    const result = await updatePreferencesAction(values);
    if (!result.ok)
      return applyActionError(form.setError, result, [
        "dateFormat",
        "weekStartsOn",
        "invoiceNumberPrefix",
        "paymentTermsDays",
        "quotationValidityDays",
        "documentTerms",
      ]);
    toast.success("Preferences saved.");
    form.reset(values);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <fieldset disabled={readOnly} className="contents">
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="dateFormat"
              label="Date format"
              render={({ field, control }) => (
                <SelectInput
                  {...control}
                  className="sm:w-full"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={DATE_FORMATS}
                  disabled={readOnly}
                />
              )}
            />
            <FormField
              control={form.control}
              name="weekStartsOn"
              label="Week starts on"
              render={({ field, control }) => (
                <SelectInput
                  {...control}
                  className="sm:w-full"
                  value={String(field.value)}
                  onValueChange={(value) => field.onChange(Number(value))}
                  options={WEEKDAYS}
                  disabled={readOnly}
                />
              )}
            />
            <FormField
              control={form.control}
              name="invoiceNumberPrefix"
              label="Invoice number prefix"
              render={({ field, control }) => <Input {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="paymentTermsDays"
              label="Payment terms (days)"
              description="Default time until an invoice is due."
              render={({ field, control }) => (
                <Input
                  type="number"
                  min={0}
                  max={365}
                  {...field}
                  onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  {...control}
                />
              )}
            />
            <FormField
              control={form.control}
              name="quotationValidityDays"
              label="Quotation validity (days)"
              render={({ field, control }) => (
                <Input
                  type="number"
                  min={1}
                  max={365}
                  {...field}
                  onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  {...control}
                />
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="documentTerms"
            label="Default terms and conditions"
            description="Printed on new quotations and invoices; can be changed on each document."
            render={({ field, control }) => <Textarea rows={3} {...field} {...control} />}
          />
          <FormStatus tone="error" message={errors.root?.message} />
          {readOnly ? null : (
            <div>
              <Button type="submit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Save preferences
              </Button>
            </div>
          )}
        </FieldGroup>
      </fieldset>
    </form>
  );
}
