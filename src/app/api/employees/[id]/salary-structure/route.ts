import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { salaryComponentSchema } from "@/lib/validation";
import { salaryStructureService } from "@/server/services/salary-structure.service";

type Context = RouteContext<"/api/employees/[id]/salary-structure">;

/** Basic salary, recurring allowances / deductions / tax and the resulting net (restricted: salaries:view). */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("salaries:view");
  return NextResponse.json(await salaryStructureService.get(ctx, routeId((await params).id, "Employee")), {
    headers: { "Cache-Control": "private, no-store" },
  });
});

export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("salaries:edit");
  const id = routeId((await params).id, "Employee");
  await salaryStructureService.add(ctx, id, salaryComponentSchema.parse(await req.json()));
  return new NextResponse(null, { status: 201 });
});
