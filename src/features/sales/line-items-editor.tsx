"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { calculateLine, calculateTotals, type LineAmounts } from "@/lib/money";
import type { SalesDocumentInput } from "@/lib/validation";
import { EMPTY_LINE } from "./defaults";

/** Line amounts while typing; a line that isn't a valid number yet counts as zero. */
function safeLine(line: SalesDocumentInput["items"][number] | undefined): LineAmounts {
  try {
    return calculateLine({
      quantity: line?.quantity || "0",
      unitPrice: line?.unitPrice || "0",
      discountPercent: line?.discountPercent || "0",
      taxRate: line?.taxRate || "0",
    });
  } catch {
    // Incomplete input (e.g. "12." while typing): shown as 0 until valid; the form's validation reports it.
    return { lineSubtotal: "0.00", discountAmount: "0.00", taxAmount: "0.00", lineTotal: "0.00" };
  }
}

interface LineItemsEditorProps {
  control: Control<SalesDocumentInput>;
  register: UseFormRegister<SalesDocumentInput>;
  errors: FieldErrors<SalesDocumentInput>;
  currency: string;
  locale: string;
  disabled?: boolean;
}

/**
 * Editable lines with live totals. Totals use the same exact decimal arithmetic as the server
 * (src/lib/money.ts), so what you see is exactly what is saved.
 */
export function LineItemsEditor({
  control,
  register,
  errors,
  currency,
  locale,
  disabled,
}: LineItemsEditorProps) {
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const lines = fields.map((_, index) => safeLine(items?.[index]));
  const totals = calculateTotals(lines);
  const show = (value: string) => formatMoney(value, { locale, currency });

  const cell = (
    index: number,
    name: "quantity" | "unitPrice" | "discountPercent" | "taxRate",
    label: string,
    defaultValue: string,
  ) => {
    const error = errors.items?.[index]?.[name]?.message;
    const id = `item-${index}-${name}`;
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs text-muted-foreground lg:sr-only">
          {label}
        </label>
        <Input
          id={id}
          inputMode="decimal"
          className="text-right"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          defaultValue={defaultValue}
          {...register(`items.${index}.${name}`)}
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium">Products and services</legend>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1fr)_6rem_8rem_6rem_6rem_8rem_2.5rem] gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:grid"
      >
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit price</span>
        <span className="text-right">Disc. %</span>
        <span className="text-right">Tax %</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      <ol className="space-y-3">
        {fields.map((field, index) => {
          const descriptionError = errors.items?.[index]?.description?.message;
          return (
            <li
              key={field.id}
              aria-label={`Line ${index + 1}`}
              className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_6rem_8rem_6rem_6rem_8rem_2.5rem] lg:items-start lg:border-0 lg:p-0"
            >
              <div className="col-span-2 min-w-0 sm:col-span-4 lg:col-span-1">
                <label
                  htmlFor={`item-${index}-description`}
                  className="text-xs text-muted-foreground lg:sr-only"
                >
                  Description of line {index + 1}
                </label>
                <Textarea
                  id={`item-${index}-description`}
                  rows={1}
                  className="min-h-9"
                  aria-invalid={Boolean(descriptionError)}
                  aria-describedby={descriptionError ? `item-${index}-description-error` : undefined}
                  defaultValue={field.description}
                  {...register(`items.${index}.description`)}
                />
                {descriptionError ? (
                  <p id={`item-${index}-description-error`} role="alert" className="mt-1 text-xs text-danger">
                    {descriptionError}
                  </p>
                ) : null}
              </div>
              {cell(index, "quantity", "Quantity", field.quantity)}
              {cell(index, "unitPrice", "Unit price", field.unitPrice)}
              {cell(index, "discountPercent", "Discount %", field.discountPercent)}
              {cell(index, "taxRate", "Tax %", field.taxRate)}
              <p className="self-center text-right text-sm font-medium" data-numeric>
                <span className="text-xs font-normal text-muted-foreground lg:sr-only">Amount </span>
                {show(lines[index]?.lineTotal ?? "0.00")}
              </p>
              <div className="flex justify-end">
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
      {errors.items?.root?.message || errors.items?.message ? (
        <p role="alert" className="text-sm text-danger">
          {errors.items?.root?.message ?? errors.items?.message}
        </p>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => append({ ...EMPTY_LINE })}>
        <Plus aria-hidden="true" />
        Add line
      </Button>

      <dl
        className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1 text-sm"
        aria-label="Totals"
        data-numeric
      >
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd className="text-right">{show(totals.subtotal)}</dd>
        <dt className="text-muted-foreground">Discount</dt>
        <dd className="text-right">−{show(totals.discountTotal)}</dd>
        <dt className="text-muted-foreground">Tax</dt>
        <dd className="text-right">{show(totals.taxTotal)}</dd>
        <dt className="border-t pt-1 font-semibold">Total</dt>
        <dd className="border-t pt-1 text-right font-semibold">{show(totals.total)}</dd>
      </dl>
    </fieldset>
  );
}
