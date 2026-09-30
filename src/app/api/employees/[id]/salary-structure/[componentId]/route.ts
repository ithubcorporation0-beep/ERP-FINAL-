import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { salaryComponentSchema } from "@/lib/validation";
import { salaryStructureService } from "@/server/services/salary-structure.service";

type Context = RouteContext<"/api/employees/[id]/salary-structure/[componentId]">;

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("salaries:edit");
  const { id, componentId } = await params;
  await salaryStructureService.update(
    ctx,
    routeId(id, "Employee"),
    routeId(componentId, "Salary component"),
    salaryComponentSchema.parse(await req.json()),
  );
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("salaries:edit");
  const { id, componentId } = await params;
  await salaryStructureService.remove(ctx, routeId(id, "Employee"), routeId(componentId, "Salary component"));
  return new NextResponse(null, { status: 204 });
});
