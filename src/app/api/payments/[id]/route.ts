import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { paymentService } from "@/server/services/payment.service";

type Context = RouteContext<"/api/payments/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("payments:view");
  return NextResponse.json(await paymentService.get(ctx, routeId((await params).id, "Payment")));
});
