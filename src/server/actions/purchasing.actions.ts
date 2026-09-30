"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission, requireTenant } from "@/lib/tenant";
import {
  cancelSupplierInvoiceSchema,
  goodsReceiptSchema,
  idSchema,
  purchaseOrderSchema,
  purchaseOrderStatusSchema,
  purchaseRequestDecisionSchema,
  purchaseRequestSchema,
  supplierInvoiceSchema,
  supplierPaymentSchema,
  supplierSchema,
} from "@/lib/validation";
import { purchaseOrderService } from "@/server/services/purchase-order.service";
import { purchaseRequestService } from "@/server/services/purchase-request.service";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";
import { supplierService } from "@/server/services/supplier.service";

function revalidatePurchasing() {
  revalidatePath("/purchasing", "layout");
  revalidatePath("/inventory", "layout");
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
}

export async function createSupplierAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("suppliers:create");
    const supplier = await supplierService.create(ctx, supplierSchema.parse(input));
    revalidatePurchasing();
    return { id: supplier.id };
  });
}

export async function updateSupplierAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("suppliers:edit");
    await supplierService.update(ctx, idSchema.parse(id), supplierSchema.parse(input));
    revalidatePurchasing();
  });
}

export async function deleteSupplierAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("suppliers:delete");
    await supplierService.remove(ctx, idSchema.parse(id));
    revalidatePurchasing();
  });
}

export async function createPurchaseRequestAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases:create");
    const request = await purchaseRequestService.create(ctx, purchaseRequestSchema.parse(input));
    revalidatePurchasing();
    return { id: request.id };
  });
}

/** Approve / reject / cancel — the service checks the permission for each and refuses self-approval. */
export async function decidePurchaseRequestAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireTenant();
    await purchaseRequestService.decide(ctx, idSchema.parse(id), purchaseRequestDecisionSchema.parse(input));
    revalidatePurchasing();
  });
}

export async function createPurchaseOrderAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases:create");
    const order = await purchaseOrderService.create(ctx, purchaseOrderSchema.parse(input));
    revalidatePurchasing();
    return { id: order.id };
  });
}

export async function updatePurchaseOrderAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("purchases:edit");
    await purchaseOrderService.update(ctx, idSchema.parse(id), purchaseOrderSchema.parse(input));
    revalidatePurchasing();
  });
}

export async function setPurchaseOrderStatusAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const orderId = idSchema.parse(id);
    const change = purchaseOrderStatusSchema.parse(input);
    if (change.action === "order") {
      await purchaseOrderService.placeOrder(await requirePermission("purchases:edit"), orderId);
    } else {
      await purchaseOrderService.cancel(await requirePermission("purchases:delete"), orderId, change.reason);
    }
    revalidatePurchasing();
  });
}

export async function receiveGoodsAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory:create");
    await purchaseOrderService.receive(ctx, idSchema.parse(id), goodsReceiptSchema.parse(input));
    revalidatePurchasing();
  });
}

export async function createSupplierInvoiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:create");
    const bill = await supplierInvoiceService.create(ctx, supplierInvoiceSchema.parse(input));
    revalidatePurchasing();
    return { id: bill.id };
  });
}

export async function cancelSupplierInvoiceAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:edit");
    const { reason } = cancelSupplierInvoiceSchema.parse(input);
    await supplierInvoiceService.cancel(ctx, idSchema.parse(id), reason);
    revalidatePurchasing();
  });
}

export async function paySupplierAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:create");
    await supplierInvoiceService.pay(ctx, supplierPaymentSchema.parse(input));
    revalidatePurchasing();
  });
}

export async function voidSupplierPaymentAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:edit");
    const { reason } = cancelSupplierInvoiceSchema.parse(input);
    await supplierInvoiceService.voidPayment(ctx, idSchema.parse(id), reason);
    revalidatePurchasing();
  });
}
