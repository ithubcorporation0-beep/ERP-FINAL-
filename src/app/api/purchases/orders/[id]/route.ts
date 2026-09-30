import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { purchaseOrderSchema } from "@/lib/validation";
import { purchaseOrderService } from "@/server/services/purchase-order.service";

type Context = RouteContext<"/api/purchases/orders/[id]">;

/** The order with received / remaining quantities per line, goods receipts and bills. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("purchases:view");
  return NextResponse.json(
    await purchaseOrderService.detail(ctx, routeId((await params).id, "Purchase order")),
  );
});

/** Edits a draft order (409 otherwise). */
export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("purchases:edit");
  const id = routeId((await params).id, "Purchase order");
  await purchaseOrderService.update(ctx, id, purchaseOrderSchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});
