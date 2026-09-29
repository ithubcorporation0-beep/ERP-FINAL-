import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { employeeStatusSchema } from "@/lib/validation";
import { employeeService } from "@/server/services/employee.service";

type Context = RouteContext<"/api/employees/[id]/status">;

/** Changes the employment status: `{ status, exitDate?, note? }`. */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("employees:edit");
  const id = routeId((await params).id, "Employee");
  await employeeService.changeStatus(ctx, id, employeeStatusSchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});
