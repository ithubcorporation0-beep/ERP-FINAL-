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
import { STOCK_OPERATION_LABELS, type StockOperationKey } from "@/config/inventory";
import { FormStatus } from "@/features/auth/form-status";
import { trimQuantity } from "@/lib/inventory";
import { stockOperationSchema, type StockOperationInput } from "@/lib/validation";
import { recordStockAction } from "@/server/actions/inventory.actions";

const FIELDS = [
  "operation",
  "productId",
  "warehouseId",
  "toWarehouseId",
  "quantity",
  "unitCost",
  "movementDate",
  "reference",
  "note",
] as const;

export interface StockProductOption extends SelectOption {
  unit: string;
  purchasePrice: string;
}

interface StockOperationFormProps {
  defaults: StockOperationInput;
  products: StockProductOption[];
  warehouses: SelectOption[];
  /** Current stock per product and warehouse, for the hints ("12 pcs in stock"). */
  levels: Record<string, Record<string, string>>;
  /** Operations the user may record (adjustments need inventory:edit). */
  operations: StockOperationKey[];
  currency: string;
  backHref: string;
}

const HINTS: Record<StockOperationKey, string> = {
  IN: "Adds stock, e.g. goods bought without a purchase order or returned by a customer.",
  OUT: "Removes stock, e.g. goods sold, used or damaged. Can't take out more than is in the warehouse.",
  ADJUST: "Sets the stock to what you counted. The difference is recorded as an adjustment.",
  TRANSFER: "Moves stock from one warehouse to another. The total doesn't change.",
};

/** Records one stock operation. The server re-checks stock under a lock, so the hints can't be abused. */
export function StockOperationForm({
  defaults,
  products,
  warehouses,
  levels,
  operations,
  currency,
  backHref,
}: StockOperationFormProps) {
  const router = useRouter();
  const form = useForm<StockOperationInput>({
    resolver: zodResolver(stockOperationSchema),
    defaultValues: defaults,
  });
  const [operation, productId, warehouseId, toWarehouseId] = useWatch({
    control: form.control,
    name: ["operation", "productId", "warehouseId", "toWarehouseId"],
  });
  const product = products.find((option) => option.value === productId);
  const stockIn = (warehouse: string | undefined) =>
    product && warehouse ? trimQuantity(levels[product.value]?.[warehouse] ?? "0") : null;
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: StockOperationInput) {
    const result = await recordStockAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success(`${STOCK_OPERATION_LABELS[values.operation]} recorded.`);
    router.push(backHref);
    router.refresh();
  }

  const select = (
    name: "operation" | "productId" | "warehouseId" | "toWarehouseId",
    label: string,
    options: readonly SelectOption[],
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

  const current = stockIn(warehouseId);
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          {select(
            "operation",
            "Operation",
            operations.map((value) => ({ value, label: STOCK_OPERATION_LABELS[value] })),
            HINTS[operation],
          )}
          {select("productId", "Product", products)}
          {select(
            "warehouseId",
            operation === "TRANSFER" ? "From warehouse" : "Warehouse",
            warehouses,
            current !== null && product ? `${current} ${product.unit} in stock here.` : undefined,
          )}
          {operation === "TRANSFER"
            ? select(
                "toWarehouseId",
                "To warehouse",
                warehouses.filter((option) => option.value !== warehouseId),
                stockIn(toWarehouseId) !== null && product
                  ? `${stockIn(toWarehouseId)} ${product.unit} in stock there.`
                  : undefined,
              )
            : null}
          <FormField
            control={form.control}
            name="quantity"
            label={
              operation === "ADJUST"
                ? `Counted quantity${product ? ` (${product.unit})` : ""}`
                : `Quantity${product ? ` (${product.unit})` : ""}`
            }
            required
            render={({ field, control }) => (
              <Input inputMode="decimal" {...field} value={field.value ?? ""} {...control} />
            )}
          />
          {operation === "IN" ? (
            <FormField
              control={form.control}
              name="unitCost"
              label={`Unit cost (${currency})`}
              description={product ? `Defaults to the purchase price (${product.purchasePrice}).` : undefined}
              render={({ field, control }) => (
                <Input
                  inputMode="decimal"
                  placeholder={product?.purchasePrice}
                  {...field}
                  value={field.value ?? ""}
                  {...control}
                />
              )}
            />
          ) : null}
          <FormField
            control={form.control}
            name="movementDate"
            label="Date"
            required
            render={({ field, control }) => (
              <Input type="date" {...field} value={field.value ?? ""} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="reference"
            label="Reference"
            description="e.g. delivery note, invoice or count sheet number."
            render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
          />
          <FormField
            control={form.control}
            name="note"
            label={operation === "ADJUST" ? "Reason" : "Note"}
            required={operation === "ADJUST"}
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
          Record {STOCK_OPERATION_LABELS[operation].toLowerCase()}
        </Button>
        <Button asChild variant="outline">
          <Link href={backHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
