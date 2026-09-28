"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import {
  expenseDecisionSchema,
  expensePaySchema,
  expenseRejectSchema,
  expenseSchema,
  idSchema,
} from "@/lib/validation";
import { expenseService } from "@/server/services/expense.service";

const LIST = "/finance/expenses";

function revalidate(id?: string) {
  revalidatePath(LIST);
  if (id) revalidatePath(`${LIST}/${id}`);
}

export async function createExpenseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses:create");
    const expense = await expenseService.create(ctx, expenseSchema.parse(input));
    revalidate();
    return { id: expense.id };
  });
}

/** Ownership / expenses:edit is checked in the service. */
export async function updateExpenseAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses:view");
    const expenseId = idSchema.parse(id);
    await expenseService.update(ctx, expenseId, expenseSchema.parse(input));
    revalidate(expenseId);
  });
}

export async function deleteExpenseAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses:view");
    await expenseService.remove(ctx, idSchema.parse(id));
    revalidate();
  });
}

export async function approveExpenseAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses:approve");
    const { id, note } = expenseDecisionSchema.parse(input);
    await expenseService.approve(ctx, id, note);
    revalidate(id);
  });
}

export async function rejectExpenseAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("expenses:reject");
    const { id, note } = expenseRejectSchema.parse(input);
    await expenseService.reject(ctx, id, note);
    revalidate(id);
  });
}

export async function payExpenseAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:create");
    const { id, method, paidAt } = expensePaySchema.parse(input);
    await expenseService.markPaid(ctx, id, method, paidAt);
    revalidate(id);
  });
}
