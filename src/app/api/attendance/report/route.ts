import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { attendanceReportQuerySchema } from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";

/** Per-employee attendance totals for a period (`?range=this-month&departmentId=`). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("attendance:view");
  const query = attendanceReportQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await attendanceService.report(ctx, query));
});
