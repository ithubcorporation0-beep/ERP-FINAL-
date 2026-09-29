import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { attendanceService } from "@/server/services/attendance.service";

type Context = RouteContext<"/api/attendance/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("attendance:view");
  return NextResponse.json(await attendanceService.get(ctx, routeId((await params).id, "Attendance record")));
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("attendance:delete");
  await attendanceService.remove(ctx, routeId((await params).id, "Attendance record"));
  return new NextResponse(null, { status: 204 });
});
