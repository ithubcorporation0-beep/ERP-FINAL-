import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { idSchema, salaryAdvanceSchema } from "@/lib/validation";
import { salaryAdvanceService } from "@/server/services/salary-advance.service";

export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("payroll:view");
  const employeeId = idSchema
    .optional()
    .catch(undefined)
    .parse(new URL(req.url).searchParams.get("employeeId") ?? undefined);
  return NextResponse.json(await salaryAdvanceService.list(ctx, { employeeId }), {
    headers: { "Cache-Control": "private, no-store" },
  });
});

/** Records an advance paid to an employee (posted to the ledger); recovered by the next paid payroll. */
export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("payroll:create");
  return NextResponse.json(
    await salaryAdvanceService.create(ctx, salaryAdvanceSchema.parse(await req.json())),
    {
      status: 201,
    },
  );
});
