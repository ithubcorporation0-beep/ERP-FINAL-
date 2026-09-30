import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { payrollService } from "@/server/services/payroll.service";

type Context = RouteContext<"/api/payroll/[id]/recalculate">;

/** Rebuilds a draft run from the current salary structures (keeps typed bonus, overtime and notes). */
export const POST = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("payroll:edit");
  return NextResponse.json(await payrollService.recalculate(ctx, routeId((await params).id, "Payroll run")));
});
