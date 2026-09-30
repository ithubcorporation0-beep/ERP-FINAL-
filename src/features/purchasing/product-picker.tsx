"use client";

import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { lineAmount } from "@/lib/inventory";

export interface PurchaseProductOption extends SelectOption {
  unit: string;
  /** Default price (the product's purchase price), exact decimal string. */
  price: string;
}

/** Product select of one purchase line (keyboard accessible, labelled per line). */
export function ProductPicker({
  id,
  label,
  value,
  products,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  products: PurchaseProductOption[];
  invalid: boolean;
  describedBy?: string;
  onChange: (product: PurchaseProductOption) => void;
}) {
  return (
    <SelectInput
      id={id}
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      className="sm:w-full"
      value={value || undefined}
      placeholder="Choose a product…"
      options={products}
      onValueChange={(next) => {
        const product = products.find((option) => option.value === next);
        if (product) onChange(product);
      }}
    />
  );
}

/** quantity × price while typing; incomplete input counts as zero until it is a valid number. */
export function safeLineAmount(quantity: string | undefined, price: string | undefined): string {
  const qty = quantity?.trim() ?? "";
  const unit = price?.trim() ?? "";
  if (!/^\d{1,15}(\.\d{1,3})?$/.test(qty) || !/^\d{1,15}(\.\d{1,2})?$/.test(unit)) return "0.00";
  return lineAmount(qty, unit);
}
