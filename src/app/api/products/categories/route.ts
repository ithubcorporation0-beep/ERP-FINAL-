import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { productCategorySchema } from "@/lib/validation";
import { productCategoryService } from "@/server/services/product-category.service";

export const GET = handle(async () => {
  const ctx = await requirePermission("products:view");
  return NextResponse.json(await productCategoryService.list(ctx));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("products:create");
  const category = await productCategoryService.create(ctx, productCategorySchema.parse(await req.json()));
  return NextResponse.json(category, { status: 201 });
});
