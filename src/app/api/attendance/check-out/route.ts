import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { attendanceService } from "@/server/services/attendance.service";

/** Checks the signed-in employee out at the server's current time. */
export const POST = handle(async () => {
  const ctx = await requirePermission("attendance:create");
  await attendanceService.checkOut(ctx);
  return new NextResponse(null, { status: 204 });
});
