import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { leaveDecisionRequestSchema } from "@/lib/validation";
import { leaveService } from "@/server/services/leave.service";

type Context = RouteContext<"/api/leaves/[id]/decision">;

/** `{ decision: "approve" | "reject", note }` — needs `leaves:approve` / `leaves:reject`, never on your own request. */
export const POST = handle(async (req: Request, { params }: Context) => {
  // Signed in first; the specific permission is checked by the service for the chosen decision.
  const ctx = await requirePermission("leaves:view");
  const id = routeId((await params).id, "Leave request");
  const body = leaveDecisionRequestSchema.parse(await req.json());
  if (body.decision === "approve") await leaveService.approve(ctx, id, body.note);
  else await leaveService.reject(ctx, id, body.note);
  return new NextResponse(null, { status: 204 });
});
