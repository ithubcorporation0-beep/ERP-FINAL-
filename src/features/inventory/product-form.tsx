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
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_UNITS } from "@/config/inventory";
import { FormStatus } from "@/features/auth/form-status";
import { productSchema, type ProductInput } from "@/lib/validation";
import { createProductAction, updateProductAction } from "@/server/actions/inventory.actions";

const FIELDS = [
  "sku",
  "name",
  "categoryId",
  "brand",
  "unit",
  "purchasePrice",
  "sellingPrice",
  "minimumStock",
  "supplierId",
  "warehouseId",
  "description",
] as const;

const NONE = "none";

interface ProductFormProps {
  productId?: string;
  defaults: ProductInput;
  categories: SelectOption[];
  suppliers: SelectOption[];
  warehouses: SelectOption[];
  currency: string;
}

/**
 * Product details. There is deliberately no "current stock" field: stock only changes by recording a stock movement
 * (stock in, goods received, adjustment…), so the history always explains the number.
 */
export function ProductForm({
  productId,
  defaults,
  categories,
  suppliers,
  warehouses,
  currency,
}: ProductFormProps) {
  const router = useRouter();
  const form = useForm<ProductInput>({ resolver: zodResolver(productSchema), defaultValues: defaults });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ProductInput) {
    if (productId) {
      const result = await updateProductAction(productId, values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Product saved.");
      router.push(`/inventory/products/${productId}`);
    } else {
      const result = await createProductAction(values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Product created.");
      router.push(`/inventory/products/${result.data.id}`);
    }
    router.refresh();
  }

  const text = (
    name: "sku" | "name" | "brand" | "unit" | "purchasePrice" | "sellingPrice" | "minimumStock",
    label: string,
    props: React.ComponentProps<typeof Input> & { description?: string } = {},
  ) => {
    const { description, ...input } = props;
    return (
      <FormField
        control={form.control}
        name={name}
        label={label}
        description={description}
        required={name !== "brand"}
        render={({ field, control }) => (
          <Input {...input} {...field} value={field.value ?? ""} {...control} />
        )}
      />
    );
  };

  const choice = (
    name: "categoryId" | "supplierId" | "warehouseId",
    label: string,
    options: SelectOption[],
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      render={({ field, control }) => (
        <SelectInput
          {...control}
          className="sm:w-full"
          value={field.value || NONE}
          onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
          options={[{ value: NONE, label: "None" }, ...options]}
        />
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          {text("name", "Product name")}
          {text("sku", "SKU", {
            autoCapitalize: "characters",
            description: "Your stock code, unique per company.",
          })}
          {choice("categoryId", "Category", categories)}
          {text("brand", "Brand")}
          {text("unit", "Unit", { list: "product-units", description: "e.g. pcs, box, kg." })}
          {text("minimumStock", "Minimum stock", {
            inputMode: "decimal",
            description: "Low-stock alert at or below this quantity (0 = no alert).",
          })}
          {text("purchasePrice", `Purchase price (${currency})`, {
            inputMode: "decimal",
            placeholder: "0.00",
          })}
          {text("sellingPrice", `Selling price (${currency})`, { inputMode: "decimal", placeholder: "0.00" })}
          {choice("supplierId", "Supplier", suppliers)}
          {choice("warehouseId", "Default warehouse", warehouses)}
          <FormField
            control={form.control}
            name="description"
            label="Description"
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={3} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          {productId ? (
            <div className="flex items-center gap-2 md:col-span-2">
              <Checkbox
                id="product-active"
                checked={isActive !== false}
                onCheckedChange={(value) => form.setValue("isActive", value === true)}
              />
              <Label htmlFor="product-active">
                Active (inactive products can&apos;t be chosen for stock operations or purchases)
              </Label>
            </div>
          ) : null}
        </div>
        <datalist id="product-units">
          {PRODUCT_UNITS.map((unit) => (
            <option key={unit} value={unit} />
          ))}
        </datalist>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {productId ? "Save changes" : "Create product"}
        </Button>
        <Button asChild variant="outline">
          <Link href={productId ? `/inventory/products/${productId}` : "/inventory"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
