import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { payrollService } from "@/server/services/payroll.service";

type Context = RouteContext<"/api/employees/[id]/payroll">;

/** The employee's payslips in approved and paid runs (payroll history). */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("payroll:view");
  return NextResponse.json(
    await payrollService.employeeHistory(ctx, routeId((await params).id, "Employee")),
    {
      headers: { "Cache-Control": "private, no-store" },
    },
  );
});
