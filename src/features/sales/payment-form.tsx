"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/config/sales";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import { paymentSchema, type PaymentInput } from "@/lib/validation";
import { recordPaymentAction } from "@/server/actions/payment.actions";

export interface PayableInvoice {
  id: string;
  label: string;
  /** Exact balance due, e.g. "57.20". */
  balance: string;
  balanceLabel: string;
}

const FIELDS = ["invoiceId", "amount", "method", "reference", "paymentDate", "notes"] as const;

export function PaymentForm({ invoices, defaults }: { invoices: PayableInvoice[]; defaults: PaymentInput }) {
  const router = useRouter();
  const form = useForm<PaymentInput>({ resolver: zodResolver(paymentSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;
  const invoiceId = useWatch({ control: form.control, name: "invoiceId" });
  const selected = invoices.find((invoice) => invoice.id === invoiceId);

  async function onSubmit(values: PaymentInput) {
    const result = await recordPaymentAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success("Payment recorded.");
    router.push(`/sales/invoices/${values.invoiceId}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <FormField
            control={form.control}
            name="invoiceId"
            label="Invoice"
            required
            description={
              selected ? `Balance due: ${selected.balanceLabel}` : "Sent or partially paid invoices."
            }
            className="md:col-span-2"
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || undefined}
                onValueChange={(value) => {
                  field.onChange(value);
                  const invoice = invoices.find((item) => item.id === value);
                  if (invoice) form.setValue("amount", invoice.balance, { shouldValidate: true });
                }}
                options={invoices.map((invoice) => ({ value: invoice.id, label: invoice.label }))}
                placeholder="Choose an invoice…"
              />
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            label="Amount"
            required
            render={({ field, control }) => <Input inputMode="decimal" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="method"
            label="Payment method"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(PAYMENT_METHODS, PAYMENT_METHOD_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="paymentDate"
            label="Payment date"
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="reference"
            label="Transaction reference"
            description="Bank reference, card receipt or cheque number."
            render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
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
        <Button type="submit" disabled={isSubmitting || invoices.length === 0}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Record payment
        </Button>
        <Button asChild variant="outline">
          <Link href={invoiceId ? `/sales/invoices/${invoiceId}` : "/sales/payments"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
