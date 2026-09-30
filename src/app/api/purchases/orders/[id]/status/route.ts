import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { purchaseOrderStatusSchema } from "@/lib/validation";
import { purchaseOrderService } from "@/server/services/purchase-order.service";

type Context = RouteContext<"/api/purchases/orders/[id]/status">;

/** `{ action: "order" }` places a draft (`purchases:edit`); `{ action: "cancel", reason }` cancels (`purchases:delete`). */
export const POST = handle(async (req: Request, { params }: Context) => {
  const id = routeId((await params).id, "Purchase order");
  const input = purchaseOrderStatusSchema.parse(await req.json());
  if (input.action === "order") {
    await purchaseOrderService.placeOrder(await requirePermission("purchases:edit"), id);
  } else {
    await purchaseOrderService.cancel(await requirePermission("purchases:delete"), id, input.reason);
  }
  return new NextResponse(null, { status: 204 });
});
