"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import {
  idSchema,
  payrollDecisionSchema,
  payrollItemSchema,
  payrollPaySchema,
  payrollReasonSchema,
  payrollRunSchema,
  salaryAdvanceSchema,
  salaryComponentSchema,
} from "@/lib/validation";
import { payrollService } from "@/server/services/payroll.service";
import { salaryAdvanceService } from "@/server/services/salary-advance.service";
import { salaryStructureService } from "@/server/services/salary-structure.service";

/** Server actions for the payroll pages: parse → authorize → service. Every rule is enforced again in the services. */

function revalidate() {
  revalidatePath("/payroll", "layout");
  revalidatePath("/hr/employees", "layout");
}

export async function processPayrollAction(
  input: unknown,
): Promise<ActionResult<{ id: string; employees: number; skipped: string[] }>> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:create");
    const result = await payrollService.process(ctx, payrollRunSchema.parse(input));
    revalidate();
    return { id: result.run.id, employees: result.employees, skipped: result.skipped };
  });
}

export async function recalculatePayrollAction(id: unknown): Promise<ActionResult<{ skipped: string[] }>> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:edit");
    const result = await payrollService.recalculate(ctx, idSchema.parse(id));
    revalidate();
    return { skipped: result.skipped };
  });
}

export async function updatePayrollItemAction(
  runId: unknown,
  itemId: unknown,
  input: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:edit");
    await payrollService.updateItem(
      ctx,
      idSchema.parse(runId),
      idSchema.parse(itemId),
      payrollItemSchema.parse(input),
    );
    revalidate();
  });
}

export async function submitPayrollAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:edit");
    await payrollService.submit(ctx, idSchema.parse(id));
    revalidate();
  });
}

export async function approvePayrollAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:approve");
    const { id, note } = payrollDecisionSchema.parse(input);
    await payrollService.approve(ctx, id, note);
    revalidate();
  });
}

export async function rejectPayrollAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:reject");
    const { id, note } = payrollReasonSchema.parse(input);
    await payrollService.reject(ctx, id, note);
    revalidate();
  });
}

export async function cancelPayrollAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:delete");
    const { id, note } = payrollReasonSchema.parse(input);
    await payrollService.cancel(ctx, id, note);
    revalidate();
  });
}

/** Paying posts to the ledger: needs accounting:create too (checked in the service). */
export async function payPayrollAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:view");
    const { id, paidAt, method } = payrollPaySchema.parse(input);
    await payrollService.markPaid(ctx, id, { paidAt, method });
    revalidatePath("/finance", "layout");
    revalidate();
  });
}

export async function createAdvanceAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:create");
    await salaryAdvanceService.create(ctx, salaryAdvanceSchema.parse(input));
    revalidate();
  });
}

export async function cancelAdvanceAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("payroll:delete");
    await salaryAdvanceService.cancel(ctx, idSchema.parse(id));
    revalidate();
  });
}

export async function addSalaryComponentAction(employeeId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("salaries:edit");
    await salaryStructureService.add(ctx, idSchema.parse(employeeId), salaryComponentSchema.parse(input));
    revalidate();
  });
}

export async function updateSalaryComponentAction(
  employeeId: unknown,
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("salaries:edit");
    await salaryStructureService.update(
      ctx,
      idSchema.parse(employeeId),
      idSchema.parse(id),
      salaryComponentSchema.parse(input),
    );
    revalidate();
  });
}

export async function removeSalaryComponentAction(employeeId: unknown, id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("salaries:edit");
    await salaryStructureService.remove(ctx, idSchema.parse(employeeId), idSchema.parse(id));
    revalidate();
  });
}
