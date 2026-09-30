import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { purchaseOrderListQuerySchema, purchaseOrderSchema } from "@/lib/validation";
import { purchaseOrderService } from "@/server/services/purchase-order.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("purchases:view");
  const query = purchaseOrderListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await purchaseOrderService.list(ctx, query));
});

/** Creates a draft order (optionally `requestId` of an approved purchase request, which becomes Ordered). */
export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("purchases:create");
  const order = await purchaseOrderService.create(ctx, purchaseOrderSchema.parse(await req.json()));
  return NextResponse.json(order, { status: 201 });
});
