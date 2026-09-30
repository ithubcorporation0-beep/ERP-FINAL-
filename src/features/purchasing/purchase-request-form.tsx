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
import { purchaseRequestSchema, type PurchaseRequestInput } from "@/lib/validation";
import { createPurchaseRequestAction } from "@/server/actions/purchasing.actions";
import { ProductPicker, type PurchaseProductOption } from "./product-picker";

const NONE = "none";

/** Ask for products to be bought. It goes to an approver before anyone orders it. */
export function PurchaseRequestForm({
  defaults,
  suppliers,
  products,
  currency,
}: {
  defaults: PurchaseRequestInput;
  suppliers: SelectOption[];
  products: PurchaseProductOption[];
  currency: string;
}) {
  const router = useRouter();
  const form = useForm<PurchaseRequestInput>({
    resolver: zodResolver(purchaseRequestSchema),
    defaultValues: defaults,
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = useWatch({ control: form.control, name: "items" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: PurchaseRequestInput) {
    const result = await createPurchaseRequestAction(values);
    if (!result.ok)
      return applyActionError(form.setError, result, ["supplierId", "neededBy", "reason", "items"]);
    toast.success("Purchase request sent for approval.");
    router.push(`/purchasing/requests/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="reason"
            label="What is it for?"
            required
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="supplierId"
            label="Suggested supplier"
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || NONE}
                onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                options={[{ value: NONE, label: "No preference" }, ...suppliers]}
              />
            )}
          />
          <FormField
            control={form.control}
            name="neededBy"
            label="Needed by"
            render={({ field, control }) => (
              <Input type="date" {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </div>
      </FieldGroup>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Products</legend>
        <ol className="space-y-3">
          {fields.map((field, index) => {
            const productError = errors.items?.[index]?.productId?.message;
            const quantityError = errors.items?.[index]?.quantity?.message;
            const priceError = errors.items?.[index]?.estimatedUnitPrice?.message;
            const unit = products.find((product) => product.value === items?.[index]?.productId)?.unit;
            return (
              <li
                key={field.id}
                aria-label={`Line ${index + 1}`}
                className="grid grid-cols-2 gap-2 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_8rem_10rem_2.5rem] lg:items-start"
              >
                <div className="col-span-2 min-w-0 lg:col-span-1">
                  <Controller
                    control={form.control}
                    name={`items.${index}.productId`}
                    render={({ field: product }) => (
                      <ProductPicker
                        id={`request-${index}-product`}
                        label={`Product of line ${index + 1}`}
                        value={product.value}
                        products={products}
                        invalid={Boolean(productError)}
                        onChange={(option) => {
                          product.onChange(option.value);
                          form.setValue(`items.${index}.estimatedUnitPrice`, option.price);
                        }}
                      />
                    )}
                  />
                  {productError ? (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {productError}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor={`request-${index}-quantity`} className="text-xs text-muted-foreground">
                    Quantity{unit ? ` (${unit})` : ""}
                  </label>
                  <Input
                    id={`request-${index}-quantity`}
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
                  <label htmlFor={`request-${index}-price`} className="text-xs text-muted-foreground">
                    Estimated price ({currency})
                  </label>
                  <Input
                    id={`request-${index}-price`}
                    inputMode="decimal"
                    className="text-right"
                    aria-invalid={Boolean(priceError)}
                    {...form.register(`items.${index}.estimatedUnitPrice`)}
                  />
                  {priceError ? (
                    <p role="alert" className="mt-1 text-xs text-danger">
                      {priceError}
                    </p>
                  ) : null}
                </div>
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ productId: "", quantity: "1", estimatedUnitPrice: "" })}
        >
          <Plus aria-hidden="true" />
          Add line
        </Button>
      </fieldset>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Send for approval
        </Button>
        <Button asChild variant="outline">
          <Link href="/purchasing/requests">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
