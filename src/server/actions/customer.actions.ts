"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { communicationSchema, customerSchema, idSchema } from "@/lib/validation";
import { customerCommunicationService } from "@/server/services/customer-communication.service";
import { customerService } from "@/server/services/customer.service";

const LIST = "/crm/customers";
const detail = (id: string) => `${LIST}/${id}`;

export async function createCustomerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("customers:create");
    const customer = await customerService.create(ctx, customerSchema.parse(input));
    revalidatePath(LIST);
    return { id: customer.id };
  });
}

export async function updateCustomerAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers:edit");
    const customerId = idSchema.parse(id);
    await customerService.update(ctx, customerId, customerSchema.parse(input));
    revalidatePath(LIST);
    revalidatePath(detail(customerId));
  });
}

export async function deleteCustomerAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers:delete");
    await customerService.remove(ctx, idSchema.parse(id));
    revalidatePath(LIST);
  });
}

export async function addCommunicationAction(customerId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers:edit");
    const id = idSchema.parse(customerId);
    await customerCommunicationService.add(ctx, id, communicationSchema.parse(input));
    revalidatePath(detail(id));
  });
}

export async function deleteCommunicationAction(
  customerId: unknown,
  entryId: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("customers:edit");
    const id = idSchema.parse(customerId);
    await customerCommunicationService.remove(ctx, id, idSchema.parse(entryId));
    revalidatePath(detail(id));
  });
}
