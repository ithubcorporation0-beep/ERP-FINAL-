import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { warehouseSchema } from "@/lib/validation";
import { warehouseService } from "@/server/services/warehouse.service";

type Context = RouteContext<"/api/inventory/warehouses/[id]">;

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("inventory:edit");
  await warehouseService.update(
    ctx,
    routeId((await params).id, "Warehouse"),
    warehouseSchema.parse(await req.json()),
  );
  return new NextResponse(null, { status: 204 });
});

/** 409 when the warehouse has stock history, products or orders. */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("inventory:delete");
  await warehouseService.remove(ctx, routeId((await params).id, "Warehouse"));
  return new NextResponse(null, { status: 204 });
});
