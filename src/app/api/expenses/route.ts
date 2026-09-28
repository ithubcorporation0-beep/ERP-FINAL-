import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { expenseListQuerySchema, expenseSchema } from "@/lib/validation";
import { expenseService } from "@/server/services/expense.service";

/** People without approval rights only ever get their own expenses (enforced in the service). */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("expenses:view");
  const query = expenseListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await expenseService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("expenses:create");
  return NextResponse.json(await expenseService.create(ctx, expenseSchema.parse(await req.json())), {
    status: 201,
  });
});
