import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { payrollStepSchema } from "@/lib/validation";
import { payrollService } from "@/server/services/payroll.service";

type Context = RouteContext<"/api/payroll/[id]/status">;

/**
 * Workflow step: `{ action: "submit" }`, `{ action: "approve", note? }`, `{ action: "reject", note }`,
 * `{ action: "cancel", note }` or `{ action: "pay", paidAt, method }`. Each step's permission is checked by the
 * service (payroll:edit / approve / reject / delete; accounting:create to pay).
 */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("payroll:view");
  const id = routeId((await params).id, "Payroll run");
  const step = payrollStepSchema.parse(await req.json());
  if (step.action === "submit") await payrollService.submit(ctx, id);
  if (step.action === "approve") await payrollService.approve(ctx, id, step.note);
  if (step.action === "reject") await payrollService.reject(ctx, id, step.note);
  if (step.action === "cancel") await payrollService.cancel(ctx, id, step.note);
  if (step.action === "pay")
    await payrollService.markPaid(ctx, id, { paidAt: step.paidAt, method: step.method });
  return new NextResponse(null, { status: 204 });
});
