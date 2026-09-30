import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { supplierInvoiceListQuerySchema, supplierInvoiceSchema } from "@/lib/validation";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";

/** Supplier invoices (bills). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("purchases:view");
  const query = supplierInvoiceListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await supplierInvoiceService.list(ctx, query));
});

/** Records a bill and posts it to Accounts Payable (rule B1). Needs `accounting:create` (and `purchases:view`). */
export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("accounting:create");
  const bill = await supplierInvoiceService.create(ctx, supplierInvoiceSchema.parse(await req.json()));
  return NextResponse.json(bill, { status: 201 });
});
