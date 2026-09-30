import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { productCategorySchema } from "@/lib/validation";
import { productCategoryService } from "@/server/services/product-category.service";

type Context = RouteContext<"/api/products/categories/[id]">;

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("products:edit");
  const id = routeId((await params).id, "Category");
  await productCategoryService.update(ctx, id, productCategorySchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});

/** 409 while products use the category. */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("products:delete");
  await productCategoryService.remove(ctx, routeId((await params).id, "Category"));
  return new NextResponse(null, { status: 204 });
});
