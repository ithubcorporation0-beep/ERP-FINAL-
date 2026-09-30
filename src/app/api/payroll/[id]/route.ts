import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { payrollService } from "@/server/services/payroll.service";

type Context = RouteContext<"/api/payroll/[id]">;

/** The run, its payslips and exact totals. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("payroll:view");
  return NextResponse.json(await payrollService.detail(ctx, routeId((await params).id, "Payroll run")), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
