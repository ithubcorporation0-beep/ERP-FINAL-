import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { payrollReportQuerySchema } from "@/lib/validation";
import { payrollService } from "@/server/services/payroll.service";

/** Payroll totals per month, department and employee for approved and paid runs (`?range=`). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("payroll:view");
  const { range } = payrollReportQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await payrollService.report(ctx, range), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
