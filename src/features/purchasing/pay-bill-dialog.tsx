"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HandCoins, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput } from "@/components/forms/select-input";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/config/sales";
import { FormStatus } from "@/features/auth/form-status";
import { supplierPaymentSchema, type SupplierPaymentInput } from "@/lib/validation";
import { paySupplierAction } from "@/server/actions/purchasing.actions";

/** Pay a bill (all or part of its open balance). Posts rule B3: Accounts Payable → Cash or Bank. */
export function PayBillDialog({
  invoiceId,
  code,
  balance,
  balanceLabel,
  today,
  currency,
}: {
  invoiceId: string;
  code: string;
  balance: string;
  balanceLabel: string;
  today: string;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const defaults: SupplierPaymentInput = {
    invoiceId,
    amount: balance,
    method: "BANK_TRANSFER",
    paymentDate: today,
    reference: "",
    notes: "",
  };
  const form = useForm<SupplierPaymentInput>({
    resolver: zodResolver(supplierPaymentSchema),
    defaultValues: defaults,
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SupplierPaymentInput) {
    const result = await paySupplierAction(values);
    if (!result.ok)
      return applyActionError(form.setError, result, [
        "amount",
        "method",
        "paymentDate",
        "reference",
        "notes",
      ]);
    toast.success("Payment recorded.");
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
      title={`Pay ${code}`}
      description={`Open balance ${balanceLabel}. Cash payments come from Cash, all other methods from Bank.`}
      trigger={
        <Button type="button">
          <HandCoins aria-hidden="true" />
          Record payment
        </Button>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="amount"
            label={`Amount (${currency})`}
            required
            render={({ field, control }) => <Input inputMode="decimal" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="method"
            label="Method"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={PAYMENT_METHODS.map((method) => ({
                  value: method,
                  label: PAYMENT_METHOD_LABELS[method],
                }))}
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
            label="Reference (e.g. transfer number)"
            render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
          />
          <FormField
            control={form.control}
            name="notes"
            label="Notes"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Record payment
          </Button>
        </div>
      </form>
    </Modal>
  );
}
