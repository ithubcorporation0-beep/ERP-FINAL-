"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { idSchema, salesDocumentSchema, sendDocumentSchema } from "@/lib/validation";
import { invoiceService } from "@/server/services/invoice.service";
import { shareLinkService } from "@/server/services/share-link.service";

function revalidate(id?: string) {
  revalidatePath("/sales/invoices");
  if (id) revalidatePath(`/sales/invoices/${id}`);
}

export async function createInvoiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("invoices:create");
    const invoice = await invoiceService.create(ctx, salesDocumentSchema.parse(input));
    revalidate();
    return { id: invoice.id };
  });
}

export async function updateInvoiceAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("invoices:edit");
    const invoiceId = idSchema.parse(id);
    await invoiceService.update(ctx, invoiceId, salesDocumentSchema.parse(input));
    revalidate(invoiceId);
  });
}

export async function markInvoiceSentAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("invoices:edit");
    const invoiceId = idSchema.parse(id);
    await invoiceService.markSent(ctx, invoiceId);
    revalidate(invoiceId);
  });
}

export async function sendInvoiceAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("invoices:edit");
    const values = sendDocumentSchema.parse(input);
    await invoiceService.send(ctx, values);
    revalidate(values.id);
  });
}

export async function cancelInvoiceAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("invoices:edit");
    const invoiceId = idSchema.parse(id);
    await invoiceService.cancel(ctx, invoiceId);
    revalidate(invoiceId);
  });
}

export async function deleteInvoiceAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("invoices:delete");
    await invoiceService.remove(ctx, idSchema.parse(id));
    revalidate();
  });
}

export async function shareInvoiceAction(id: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("invoices:edit");
    const invoice = await invoiceService.get(ctx, idSchema.parse(id));
    const { url } = await shareLinkService.create(ctx, "INVOICE", invoice.id, invoice.code);
    revalidate(invoice.id);
    return { url };
  });
}
