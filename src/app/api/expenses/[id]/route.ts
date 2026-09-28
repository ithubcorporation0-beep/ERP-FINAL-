import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { expenseSchema } from "@/lib/validation";
import { expenseService } from "@/server/services/expense.service";

type Context = RouteContext<"/api/expenses/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  return NextResponse.json(await expenseService.get(ctx, routeId((await params).id, "Expense")));
});

/** Owners may change their own pending/rejected expenses; others need expenses:edit (checked in the service). */
export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  const id = routeId((await params).id, "Expense");
  return NextResponse.json(await expenseService.update(ctx, id, expenseSchema.parse(await req.json())));
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("expenses:view");
  await expenseService.remove(ctx, routeId((await params).id, "Expense"));
  return new NextResponse(null, { status: 204 });
});
