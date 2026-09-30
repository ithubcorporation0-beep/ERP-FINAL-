import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { supplierSchema } from "@/lib/validation";
import { supplierService } from "@/server/services/supplier.service";

type Context = RouteContext<"/api/suppliers/[id]">;

/** The supplier with its products, purchase orders, bills and payments (each only with its view permission). */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("suppliers:view");
  const id = routeId((await params).id, "Supplier");
  const [supplier, related] = await Promise.all([
    supplierService.get(ctx, id),
    supplierService.related(ctx, id),
  ]);
  return NextResponse.json({ ...supplier, ...related });
});

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("suppliers:edit");
  await supplierService.update(
    ctx,
    routeId((await params).id, "Supplier"),
    supplierSchema.parse(await req.json()),
  );
  return new NextResponse(null, { status: 204 });
});

/** 409 when the supplier has purchase orders or bills. */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("suppliers:delete");
  await supplierService.remove(ctx, routeId((await params).id, "Supplier"));
  return new NextResponse(null, { status: 204 });
});
