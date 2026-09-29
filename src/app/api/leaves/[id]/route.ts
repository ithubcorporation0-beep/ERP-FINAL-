import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { leaveService } from "@/server/services/leave.service";

type Context = RouteContext<"/api/leaves/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("leaves:view");
  return NextResponse.json(await leaveService.get(ctx, routeId((await params).id, "Leave request")));
});

/** Cancels a pending request (its employee, or `leaves:delete` — checked in the service). */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("leaves:view");
  await leaveService.cancel(ctx, routeId((await params).id, "Leave request"));
  return new NextResponse(null, { status: 204 });
});
