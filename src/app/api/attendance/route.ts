import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { attendanceEntrySchema, attendanceListQuerySchema } from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";

/** Attendance history. People who may only see their own attendance get their own records (service rule). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("attendance:view");
  const query = attendanceListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await attendanceService.list(ctx, query));
});

/** HR enters or corrects one employee-day (times "HH:MM" in the company time zone). */
export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("attendance:edit");
  return NextResponse.json(
    await attendanceService.saveEntry(ctx, attendanceEntrySchema.parse(await req.json())),
    {
      status: 201,
    },
  );
});
