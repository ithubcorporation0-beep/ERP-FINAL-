import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { cancelSupplierInvoiceSchema } from "@/lib/validation";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";

type Context = RouteContext<"/api/purchases/payments/[id]/void">;

/** Voids a supplier payment `{ reason }` (reversal B4) and reopens the bill's balance. */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("accounting:edit");
  const id = routeId((await params).id, "Payment");
  const { reason } = cancelSupplierInvoiceSchema.parse(await req.json());
  await supplierInvoiceService.voidPayment(ctx, id, reason);
  return new NextResponse(null, { status: 204 });
});
