import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { productListQuerySchema, productSchema } from "@/lib/validation";
import { productService } from "@/server/services/product.service";

/** Products with their stock (sum of stock movements). `?stock=low|out` lists low / out-of-stock products. */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("products:view");
  const query = productListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await productService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("products:create");
  return NextResponse.json(await productService.create(ctx, productSchema.parse(await req.json())), {
    status: 201,
  });
});
