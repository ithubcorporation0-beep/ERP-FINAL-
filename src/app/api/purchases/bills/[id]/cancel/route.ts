import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { cancelSupplierInvoiceSchema } from "@/lib/validation";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";

type Context = RouteContext<"/api/purchases/bills/[id]/cancel">;

/** Cancels an unpaid bill `{ reason }` (reversal B2); 409 once anything was paid. */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("accounting:edit");
  const id = routeId((await params).id, "Supplier invoice");
  const { reason } = cancelSupplierInvoiceSchema.parse(await req.json());
  await supplierInvoiceService.cancel(ctx, id, reason);
  return new NextResponse(null, { status: 204 });
});
