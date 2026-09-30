import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { purchaseRequestService } from "@/server/services/purchase-request.service";

type Context = RouteContext<"/api/purchases/requests/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requireTenant();
  return NextResponse.json(
    await purchaseRequestService.get(ctx, routeId((await params).id, "Purchase request")),
  );
});
