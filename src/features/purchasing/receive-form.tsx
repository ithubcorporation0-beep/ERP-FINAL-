"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { goodsReceiptSchema, type GoodsReceiptInput } from "@/lib/validation";
import { receiveGoodsAction } from "@/server/actions/purchasing.actions";

export interface ReceiveLine {
  orderItemId: string;
  product: string;
  sku: string;
  unit: string;
  ordered: string;
  received: string;
  remaining: string;
}

/**
 * Goods received against an order: one quantity per open line (blank = nothing received). Saving adds the stock
 * to the order's warehouse; the server refuses more than what is still open.
 */
export function ReceiveForm({
  orderId,
  lines,
  today,
  warehouse,
}: {
  orderId: string;
  lines: ReceiveLine[];
  today: string;
  warehouse: string;
}) {
  const router = useRouter();
  const form = useForm<GoodsReceiptInput>({
    resolver: zodResolver(goodsReceiptSchema),
    defaultValues: {
      receivedDate: today,
      note: "",
      items: lines.map((line) => ({ orderItemId: line.orderItemId, quantity: line.remaining })),
    },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: GoodsReceiptInput) {
    const result = await receiveGoodsAction(orderId, values);
    if (!result.ok) return applyActionError(form.setError, result, ["receivedDate", "note", "items"]);
    toast.success(`Goods received into ${warehouse}.`);
    router.push(`/purchasing/orders/${orderId}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <ol className="space-y-3" aria-label="Order lines">
        {lines.map((line, index) => {
          const error = errors.items?.[index]?.quantity?.message;
          return (
            <li
              key={line.orderItemId}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-medium">{line.product}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{line.sku}</span> · ordered {line.ordered} · received{" "}
                  {line.received} ·{" "}
                  <span className="font-medium text-foreground">{line.remaining} still open</span>
                </p>
              </div>
              <div>
                <label htmlFor={`receive-${index}`} className="text-xs text-muted-foreground">
                  Received now ({line.unit})
                </label>
                <Input
                  id={`receive-${index}`}
                  inputMode="decimal"
                  className="text-right"
                  aria-invalid={Boolean(error)}
                  {...form.register(`items.${index}.quantity`)}
                />
                {error ? (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {error}
                  </p>
                ) : null}
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
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="receivedDate"
          label="Received on"
          required
          render={({ field, control }) => (
            <Input type="date" {...field} value={field.value ?? ""} {...control} />
          )}
        />
        <FormField
          control={form.control}
          name="note"
          label="Note (e.g. delivery note number)"
          render={({ field, control }) => (
            <Textarea rows={1} {...field} value={field.value ?? ""} {...control} />
          )}
        />
      </div>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Record goods received
        </Button>
        <Button asChild variant="outline">
          <Link href={`/purchasing/orders/${orderId}`}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
