import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission, requireTenant } from "@/lib/tenant";
import { purchaseRequestListQuerySchema, purchaseRequestSchema } from "@/lib/validation";
import { purchaseRequestService } from "@/server/services/purchase-request.service";

/** Purchase requests — all with `purchases:view`, otherwise the caller's own (checked in the service). */
export const GET = handle(async (req: Request) => {
  const ctx = await requireTenant();
  const query = purchaseRequestListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await purchaseRequestService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("purchases:create");
  const request = await purchaseRequestService.create(ctx, purchaseRequestSchema.parse(await req.json()));
  return NextResponse.json(request, { status: 201 });
});
