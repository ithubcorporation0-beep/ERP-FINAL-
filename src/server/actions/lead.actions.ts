"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { idSchema, leadSchema, leadStatusSchema } from "@/lib/validation";
import { leadService } from "@/server/services/lead.service";

const LEADS = "/crm/leads";

function revalidateLeads(id?: string) {
  revalidatePath(LEADS);
  revalidatePath(`${LEADS}/pipeline`);
  if (id) revalidatePath(`${LEADS}/${id}`);
}

export async function createLeadAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("leads:create");
    const lead = await leadService.create(ctx, leadSchema.parse(input));
    revalidateLeads();
    return { id: lead.id };
  });
}

export async function updateLeadAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("leads:edit");
    const leadId = idSchema.parse(id);
    await leadService.update(ctx, leadId, leadSchema.parse(input));
    revalidateLeads(leadId);
  });
}

/** Moves a lead to another pipeline stage (board drag and drop, "Move to" menu, detail page). */
export async function setLeadStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("leads:edit");
    const { id, status } = leadStatusSchema.parse(input);
    await leadService.setStatus(ctx, id, status);
    revalidateLeads(id);
  });
}

export async function deleteLeadAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("leads:delete");
    await leadService.remove(ctx, idSchema.parse(id));
    revalidateLeads();
  });
}

export async function convertLeadAction(id: unknown): Promise<ActionResult<{ customerId: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("leads:edit");
    const leadId = idSchema.parse(id);
    const customer = await leadService.convert(ctx, leadId);
    revalidateLeads(leadId);
    revalidatePath("/crm/customers");
    return { customerId: customer.id };
  });
}
