import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { supplierPaymentListQuerySchema, supplierPaymentSchema } from "@/lib/validation";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";

/** Supplier payments, newest first (`?supplierId=`). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("purchases:view");
  const query = supplierPaymentListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await supplierInvoiceService.payments(ctx, query));
});

/** Pays a bill (rule B3); at most its open balance. */
export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("accounting:create");
  const payment = await supplierInvoiceService.pay(ctx, supplierPaymentSchema.parse(await req.json()));
  return NextResponse.json(payment, { status: 201 });
});
