import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { employeeSchema } from "@/lib/validation";
import { employeeService } from "@/server/services/employee.service";

type Context = RouteContext<"/api/employees/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:view");
  return NextResponse.json(await employeeService.get(ctx, routeId((await params).id, "Employee")));
});

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:edit");
  const id = routeId((await params).id, "Employee");
  return NextResponse.json(await employeeService.update(ctx, id, employeeSchema.parse(await req.json())));
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:delete");
  await employeeService.remove(ctx, routeId((await params).id, "Employee"));
  return new NextResponse(null, { status: 204 });
});
