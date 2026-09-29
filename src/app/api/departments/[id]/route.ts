import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { departmentSchema } from "@/lib/validation";
import { departmentService } from "@/server/services/department.service";

type Context = RouteContext<"/api/departments/[id]">;

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:edit");
  const id = routeId((await params).id, "Department");
  await departmentService.update(ctx, id, departmentSchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:delete");
  await departmentService.remove(ctx, routeId((await params).id, "Department"));
  return new NextResponse(null, { status: 204 });
});
