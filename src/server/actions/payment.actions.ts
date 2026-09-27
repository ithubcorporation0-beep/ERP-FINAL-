"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { paymentSchema, voidPaymentSchema } from "@/lib/validation";
import { paymentService } from "@/server/services/payment.service";

export async function recordPaymentAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("payments:create");
    const values = paymentSchema.parse(input);
    const payment = await paymentService.record(ctx, values);
    revalidatePath("/sales/payments");
    revalidatePath("/sales/invoices");
    revalidatePath(`/sales/invoices/${values.invoiceId}`);
    return { id: payment.id };
  });
}

export async function voidPaymentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payments:delete");
    const { id, reason } = voidPaymentSchema.parse(input);
    await paymentService.void(ctx, id, reason);
    revalidatePath("/sales/payments");
    revalidatePath("/sales/invoices", "layout");
  });
}
