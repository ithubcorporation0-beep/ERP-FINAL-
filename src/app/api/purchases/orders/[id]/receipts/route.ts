import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { goodsReceiptSchema } from "@/lib/validation";
import { purchaseOrderService } from "@/server/services/purchase-order.service";

type Context = RouteContext<"/api/purchases/orders/[id]/receipts">;

/** Records goods received `{ receivedDate, note?, items: [{ orderItemId, quantity }] }` — adds stock. */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("inventory:create");
  const id = routeId((await params).id, "Purchase order");
  const receipt = await purchaseOrderService.receive(ctx, id, goodsReceiptSchema.parse(await req.json()));
  return NextResponse.json(receipt, { status: 201 });
});
