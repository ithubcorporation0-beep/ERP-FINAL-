"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { idSchema, salesDocumentSchema, sendDocumentSchema } from "@/lib/validation";
import { quotationCode, quotationService } from "@/server/services/quotation.service";
import { shareLinkService } from "@/server/services/share-link.service";

function revalidate(id?: string) {
  revalidatePath("/sales/quotations");
  revalidatePath("/sales/orders");
  if (id) revalidatePath(`/sales/quotations/${id}`);
}

export async function createQuotationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:create");
    const quotation = await quotationService.create(ctx, salesDocumentSchema.parse(input));
    revalidate();
    return { id: quotation.id };
  });
}

export async function updateQuotationAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:edit");
    const quotationId = idSchema.parse(id);
    await quotationService.update(ctx, quotationId, salesDocumentSchema.parse(input));
    revalidate(quotationId);
  });
}

export async function duplicateQuotationAction(id: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:create");
    const copy = await quotationService.duplicate(ctx, idSchema.parse(id));
    revalidate();
    return { id: copy.id };
  });
}

export async function sendQuotationAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:edit");
    const values = sendDocumentSchema.parse(input);
    await quotationService.send(ctx, values);
    revalidate(values.id);
  });
}

export async function confirmQuotationAction(id: unknown): Promise<ActionResult<{ orderCode: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:edit");
    const quotationId = idSchema.parse(id);
    const orderCode = await quotationService.confirm(ctx, quotationId);
    revalidate(quotationId);
    return { orderCode };
  });
}

export async function closeQuotationAction(id: unknown, to: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:edit");
    const quotationId = idSchema.parse(id);
    await quotationService.setClosed(ctx, quotationId, z.enum(["DECLINED", "CANCELLED"]).parse(to));
    revalidate(quotationId);
  });
}

export async function deleteQuotationAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:delete");
    await quotationService.remove(ctx, idSchema.parse(id));
    revalidate();
  });
}

export async function convertQuotationAction(id: unknown): Promise<ActionResult<{ invoiceId: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:edit");
    const quotationId = idSchema.parse(id);
    const invoice = await quotationService.convertToInvoice(ctx, quotationId);
    revalidate(quotationId);
    revalidatePath("/sales/invoices");
    return { invoiceId: invoice.id };
  });
}

/** A share link for WhatsApp (and anything else that sends a URL). */
export async function shareQuotationAction(id: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("quotations:edit");
    const quotation = await quotationService.get(ctx, idSchema.parse(id));
    const { url } = await shareLinkService.create(
      ctx,
      "QUOTATION",
      quotation.id,
      quotationCode(quotation).code,
    );
    revalidate(quotation.id);
    return { url };
  });
}
