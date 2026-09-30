import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { payrollListQuerySchema, payrollRunSchema } from "@/lib/validation";
import { payrollService } from "@/server/services/payroll.service";

/** Payroll runs with employee count and net total. Salary data: `payroll:view` only. */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("payroll:view");
  const query = payrollListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await payrollService.list(ctx, query), {
    headers: { "Cache-Control": "private, no-store" },
  });
});

/** Processes a month `{ period: "YYYY-MM", payDate, notes? }` — 409 if the month already has a payroll. */
export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("payroll:create");
  return NextResponse.json(await payrollService.process(ctx, payrollRunSchema.parse(await req.json())), {
    status: 201,
  });
});
