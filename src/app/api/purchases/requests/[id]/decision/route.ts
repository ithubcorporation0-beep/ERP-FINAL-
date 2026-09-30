import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { purchaseRequestDecisionSchema } from "@/lib/validation";
import { purchaseRequestService } from "@/server/services/purchase-request.service";

type Context = RouteContext<"/api/purchases/requests/[id]/decision">;

/**
 * `{ decision: approve | reject | cancel, note }` — approve / reject need `purchases:approve` / `reject` and never
 * apply to your own request; cancel is for the requester or `purchases:delete` (checked in the service).
 */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requireTenant();
  const id = routeId((await params).id, "Purchase request");
  await purchaseRequestService.decide(ctx, id, purchaseRequestDecisionSchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});
