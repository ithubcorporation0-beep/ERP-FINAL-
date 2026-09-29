import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { attendanceService } from "@/server/services/attendance.service";

/** Today's attendance dashboard (people who see everyone's attendance only). */
export const GET = handle(async () => {
  const ctx = await requirePermission("attendance:view");
  return NextResponse.json(await attendanceService.today(ctx));
});
