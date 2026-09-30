import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";

type Context = RouteContext<"/api/purchases/bills/[id]">;

/** The bill with its payments. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("purchases:view");
  return NextResponse.json(
    await supplierInvoiceService.get(ctx, routeId((await params).id, "Supplier invoice")),
  );
});
