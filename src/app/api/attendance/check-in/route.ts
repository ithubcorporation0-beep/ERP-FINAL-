import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { attendanceService } from "@/server/services/attendance.service";

/** Checks the signed-in employee in at the server's current time (no client timestamp is accepted). */
export const POST = handle(async () => {
  const ctx = await requirePermission("attendance:create");
  return NextResponse.json(await attendanceService.checkIn(ctx), { status: 201 });
});
