import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { productSchema } from "@/lib/validation";
import { productService } from "@/server/services/product.service";

type Context = RouteContext<"/api/products/[id]">;

/** The product with its stock per warehouse, quantity on order and stock value. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("products:view");
  return NextResponse.json(await productService.detail(ctx, routeId((await params).id, "Product")));
});

/** Product details only — stock changes through stock movements (/api/inventory). */
export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("products:edit");
  await productService.update(
    ctx,
    routeId((await params).id, "Product"),
    productSchema.parse(await req.json()),
  );
  return new NextResponse(null, { status: 204 });
});

/** 409 while the product still has stock. */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("products:delete");
  await productService.remove(ctx, routeId((await params).id, "Product"));
  return new NextResponse(null, { status: 204 });
});
