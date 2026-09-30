import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { productService } from "@/server/services/product.service";

/** Low-stock alerts: active products at or below their minimum stock. */
export const GET = handle(async () => {
  const ctx = await requirePermission("products:view");
  return NextResponse.json(await productService.lowStock(ctx));
});
