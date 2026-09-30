"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { formatMoney } from "@/lib/format";
import { addMoney } from "@/lib/money";
import { supplierInvoiceSchema, type SupplierInvoiceInput } from "@/lib/validation";
import { createSupplierInvoiceAction } from "@/server/actions/purchasing.actions";

const FIELDS = [
  "supplierId",
  "orderId",
  "supplierReference",
  "invoiceDate",
  "dueDate",
  "subtotal",
  "taxAmount",
  "notes",
] as const;
const NONE = "none";
const MONEY = /^\d{1,15}(\.\d{1,2})?$/;

export interface BillableOrder extends SelectOption {
  supplierId: string;
}

/** Record a supplier's bill. Saving posts it to Accounts Payable (rule B1). */
export function BillForm({
  defaults,
  suppliers,
  orders,
  locale,
  currency,
}: {
  defaults: SupplierInvoiceInput;
  suppliers: SelectOption[];
  orders: BillableOrder[];
  locale: string;
  currency: string;
}) {
  const router = useRouter();
  const form = useForm<SupplierInvoiceInput>({
    resolver: zodResolver(supplierInvoiceSchema),
    defaultValues: defaults,
  });
  const [supplierId, subtotal, taxAmount] = useWatch({
    control: form.control,
    name: ["supplierId", "subtotal", "taxAmount"],
  });
  const total =
    MONEY.test(subtotal ?? "") && MONEY.test(taxAmount ?? "") ? addMoney(subtotal, taxAmount) : null;
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SupplierInvoiceInput) {
    const result = await createSupplierInvoiceAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success("Supplier invoice recorded.");
    router.push(`/purchasing/bills/${result.data.id}`);
    router.refresh();
  }

  const text = (
    name: "supplierReference" | "invoiceDate" | "dueDate" | "subtotal" | "taxAmount",
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    required = false,
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      required={required}
      render={({ field, control }) => <Input {...props} {...field} value={field.value ?? ""} {...control} />}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="supplierId"
            label="Supplier"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || undefined}
                placeholder="Choose a supplier…"
                onValueChange={(value) => {
                  field.onChange(value);
                  form.setValue("orderId", "");
                }}
                options={suppliers}
              />
            )}
          />
          <FormField
            control={form.control}
            name="orderId"
            label="Purchase order"
            description="Optional. A bill can't bring an order above its total."
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || NONE}
                onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                options={[
                  { value: NONE, label: "Not linked to an order" },
                  ...orders.filter((order) => order.supplierId === supplierId),
                ]}
              />
            )}
          />
          {text("supplierReference", "Supplier's invoice number")}
          <div className="hidden md:block" aria-hidden="true" />
          {text("invoiceDate", "Invoice date", { type: "date" }, true)}
          {text("dueDate", "Due date", { type: "date" })}
          {text(
            "subtotal",
            `Amount before tax (${currency})`,
            { inputMode: "decimal", placeholder: "0.00" },
            true,
          )}
          {text("taxAmount", `Tax (${currency})`, { inputMode: "decimal", placeholder: "0.00" }, true)}
          <p className="text-sm md:col-span-2">
            Total to pay{" "}
            <span className="text-base font-semibold" data-numeric>
              {total ? formatMoney(total, { locale, currency }) : "—"}
            </span>
          </p>
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
          Record supplier invoice
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchasing/bills">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
