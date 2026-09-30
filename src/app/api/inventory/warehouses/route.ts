import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission, requireTenant } from "@/lib/tenant";
import { warehouseSchema } from "@/lib/validation";
import { warehouseService } from "@/server/services/warehouse.service";

/** Warehouses — readable with inventory, product or purchasing access (checked in the service). */
export const GET = handle(async () => {
  const ctx = await requireTenant();
  return NextResponse.json(await warehouseService.list(ctx));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("inventory:create");
  return NextResponse.json(await warehouseService.create(ctx, warehouseSchema.parse(await req.json())), {
    status: 201,
  });
});
