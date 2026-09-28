"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { accountSchema, idSchema, journalEntrySchema } from "@/lib/validation";
import { accountingService } from "@/server/services/accounting.service";

function revalidate() {
  revalidatePath("/finance", "layout");
}

export async function createAccountAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:create");
    const account = await accountingService.createAccount(ctx, accountSchema.parse(input));
    revalidate();
    return { id: account.id };
  });
}

export async function updateAccountAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:edit");
    await accountingService.updateAccount(ctx, idSchema.parse(id), accountSchema.parse(input));
    revalidate();
  });
}

export async function deleteAccountAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:delete");
    await accountingService.deleteAccount(ctx, idSchema.parse(id));
    revalidate();
  });
}

export async function createTransactionAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:create");
    const entry = await accountingService.createTransaction(ctx, journalEntrySchema.parse(input));
    revalidate();
    return { id: entry.id };
  });
}

export async function reverseTransactionAction(id: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("accounting:delete");
    const reversal = await accountingService.reverseTransaction(ctx, idSchema.parse(id));
    revalidate();
    return { id: reversal.id };
  });
}
