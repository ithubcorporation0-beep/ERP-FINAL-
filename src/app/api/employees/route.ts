import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { employeeListQuerySchema, employeeSchema } from "@/lib/validation";
import { employeeService } from "@/server/services/employee.service";

/** Employee profiles. Salary and bank details are never included — see /api/employees/[id]/compensation. */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("employees:view");
  const query = employeeListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await employeeService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("employees:create");
  return NextResponse.json(await employeeService.create(ctx, employeeSchema.parse(await req.json())), {
    status: 201,
  });
});
