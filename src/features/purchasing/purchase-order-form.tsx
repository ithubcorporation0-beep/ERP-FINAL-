"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
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
import { sumMoney } from "@/lib/money";
import { purchaseOrderSchema, type PurchaseOrderInput } from "@/lib/validation";
import { createPurchaseOrderAction, updatePurchaseOrderAction } from "@/server/actions/purchasing.actions";
import { ProductPicker, safeLineAmount, type PurchaseProductOption } from "./product-picker";

const FIELDS = [
  "supplierId",
  "warehouseId",
  "requestId",
  "orderDate",
  "expectedDate",
  "notes",
  "items",
] as const;

interface PurchaseOrderFormProps {
  orderId?: string;
  defaults: PurchaseOrderInput;
  suppliers: SelectOption[];
  warehouses: SelectOption[];
  products: PurchaseProductOption[];
  /** Shown when the order comes from a purchase request (can't be changed). */
  requestLabel?: string;
  locale: string;
  currency: string;
}

/** A purchase order with product lines and a live total (same exact arithmetic as the server). */
export function PurchaseOrderForm({
  orderId,
  defaults,
  suppliers,
  warehouses,
  products,
  requestLabel,
  locale,
  currency,
}: PurchaseOrderFormProps) {
  const router = useRouter();
  const form = useForm<PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: defaults,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = useWatch({ control: form.control, name: "items" });
  const amounts = fields.map((_, index) =>
    safeLineAmount(items?.[index]?.quantity, items?.[index]?.unitPrice),
  );
  const show = (value: string) => formatMoney(value, { locale, currency }) ?? value;
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: PurchaseOrderInput) {
    if (orderId) {
      const result = await updatePurchaseOrderAction(orderId, values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Purchase order saved.");
      router.push(`/purchasing/orders/${orderId}`);
    } else {
      const result = await createPurchaseOrderAction(values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Purchase order created as a draft.");
      router.push(`/purchasing/orders/${result.data.id}`);
    }
    router.refresh();
  }

  const select = (
    name: "supplierId" | "warehouseId",
    label: string,
    options: SelectOption[],
    description?: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      required
      description={description}
      render={({ field, control }) => (
        <SelectInput
          {...control}
          className="sm:w-full"
          value={field.value || undefined}
          placeholder="Choose…"
          onValueChange={field.onChange}
          options={options}
        />
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          {select("supplierId", "Supplier", suppliers)}
          {select("warehouseId", "Receive into warehouse", warehouses)}
          <FormField
            control={form.control}
            name="orderDate"
            label="Order date"
            required
            render={({ field, control }) => (
              <Input type="date" {...field} value={field.value ?? ""} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="expectedDate"
            label="Expected delivery"
            render={({ field, control }) => (
              <Input type="date" {...field} value={field.value ?? ""} {...control} />
            )}
          />
          {requestLabel ? (
            <p className="text-sm text-muted-foreground md:col-span-2">
              From purchase request {requestLabel}.
            </p>
          ) : null}
        </div>
      </FieldGroup>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Products</legend>
        <ol className="space-y-3">
          {fields.map((field, index) => {
            const productError = errors.items?.[index]?.productId?.message;
            const quantityError = errors.items?.[index]?.quantity?.message;
            const priceError = errors.items?.[index]?.unitPrice?.message;
            const unit = products.find((product) => product.value === items?.[index]?.productId)?.unit;
            return (
              <li
                key={field.id}
                aria-label={`Line ${index + 1}`}
                className="grid grid-cols-2 gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_8rem_9rem_9rem_2.5rem] lg:items-start"
              >
                <div className="col-span-2 min-w-0 lg:col-span-1">
                  <Controller
                    control={form.control}
                    name={`items.${index}.productId`}
                    render={({ field: product }) => (
                      <ProductPicker
                        id={`line-${index}-product`}
                        label={`Product of line ${index + 1}`}
                        value={product.value}
                        products={products}
                        invalid={Boolean(productError)}
                        describedBy={productError ? `line-${index}-product-error` : undefined}
                        onChange={(option) => {
                          product.onChange(option.value);
                          form.setValue(`items.${index}.unitPrice`, option.price);
                        }}
                      />
                    )}
                  />
                  {productError ? (
                    <p id={`line-${index}-product-error`} role="alert" className="mt-1 text-xs text-danger">
                      {productError}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor={`line-${index}-quantity`} className="text-xs text-muted-foreground">
                    Quantity{unit ? ` (${unit})` : ""}
                  </label>
                  <Input
                    id={`line-${index}-quantity`}
                    inputMode="decimal"
                    className="text-right"
                    aria-invalid={Boolean(quantityError)}
                    {...form.register(`items.${index}.quantity`)}
                  />
                  {quantityError ? (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {quantityError}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor={`line-${index}-price`} className="text-xs text-muted-foreground">
                    Unit price ({currency})
                  </label>
                  <Input
                    id={`line-${index}-price`}
                    inputMode="decimal"
                    className="text-right"
                    aria-invalid={Boolean(priceError)}
                    {...form.register(`items.${index}.unitPrice`)}
                  />
                  {priceError ? (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {priceError}
                    </p>
                  ) : null}
                </div>
                <p className="self-end pb-2 text-right text-sm font-medium" data-numeric>
                  <span className="text-xs font-normal text-muted-foreground">Amount </span>
                  {show(amounts[index] ?? "0.00")}
                </p>
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
        {errors.items?.message ? (
          <p role="alert" className="text-sm text-danger">
            {errors.items.message}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ productId: "", quantity: "1", unitPrice: "0.00" })}
          >
            <Plus aria-hidden="true" />
            Add line
          </Button>
          <p className="text-sm">
            Total{" "}
            <span className="text-base font-semibold" data-numeric>
              {show(sumMoney(amounts))}
            </span>
          </p>
        </div>
      </fieldset>

      <FormField
        control={form.control}
        name="notes"
        label="Notes for the supplier"
        render={({ field, control }) => (
          <Textarea rows={3} {...field} value={field.value ?? ""} {...control} />
        )}
      />
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {orderId ? "Save changes" : "Create draft order"}
        </Button>
        <Button asChild variant="outline">
          <Link href={orderId ? `/purchasing/orders/${orderId}` : "/purchasing/orders"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
