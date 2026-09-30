import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { productService } from "@/server/services/product.service";

/** Stock on hand × purchase price, per product and in total. */
export const GET = handle(async () => {
  const ctx = await requirePermission("products:view");
  return NextResponse.json(await productService.valuation(ctx));
});
