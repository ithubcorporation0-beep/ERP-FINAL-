import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission, requireTenant } from "@/lib/tenant";
import { stockMovementListQuerySchema, stockOperationSchema } from "@/lib/validation";
import { stockService } from "@/server/services/stock.service";

/** Inventory history: stock movements, newest first (`?productId=&warehouseId=&type=`). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("inventory:view");
  const query = stockMovementListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await stockService.list(ctx, query));
});

/**
 * Records a stock operation `{ operation: IN | OUT | ADJUST | TRANSFER, … }` — `inventory:create`, or
 * `inventory:edit` for adjustments (checked in the service, which knows the operation).
 */
export const POST = handle(async (req: Request) => {
  const ctx = await requireTenant();
  const movements = await stockService.record(ctx, stockOperationSchema.parse(await req.json()));
  return NextResponse.json(movements, { status: 201 });
});
