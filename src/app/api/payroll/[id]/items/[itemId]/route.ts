import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { payrollItemSchema } from "@/lib/validation";
import { payrollService } from "@/server/services/payroll.service";

type Context = RouteContext<"/api/payroll/[id]/items/[itemId]">;

/** Adjusts a draft payslip. Net is recalculated on the server with the payroll formula. */
export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("payroll:edit");
  const { id, itemId } = await params;
  await payrollService.updateItem(
    ctx,
    routeId(id, "Payroll run"),
    routeId(itemId, "Payslip"),
    payrollItemSchema.parse(await req.json()),
  );
  return new NextResponse(null, { status: 204 });
});
