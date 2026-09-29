import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { departmentSchema } from "@/lib/validation";
import { departmentService } from "@/server/services/department.service";

export const GET = handle(async () => {
  const ctx = await requirePermission("employees:view");
  return NextResponse.json(await departmentService.list(ctx));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("employees:create");
  return NextResponse.json(await departmentService.create(ctx, departmentSchema.parse(await req.json())), {
    status: 201,
  });
});
