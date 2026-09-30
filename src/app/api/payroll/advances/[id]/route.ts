import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { salaryAdvanceService } from "@/server/services/salary-advance.service";

type Context = RouteContext<"/api/payroll/advances/[id]">;

/** Cancels an outstanding advance (the money came back); its posting is reversed. */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("payroll:delete");
  await salaryAdvanceService.cancel(ctx, routeId((await params).id, "Salary advance"));
  return new NextResponse(null, { status: 204 });
});
