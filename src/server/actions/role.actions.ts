"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { idSchema, roleSchema } from "@/lib/validation";
import { roleService } from "@/server/services/role.service";

export async function createRoleAction(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  const result = await runAction(async () => {
    const ctx = await requirePermission("roles:manage");
    return roleService.create(ctx, roleSchema.parse(input));
  });
  if (result.ok) {
    revalidatePath("/roles");
    redirect(`/roles/${result.data.id}?saved=1`);
  }
  return result;
}

export async function updateRoleAction(roleId: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("roles:manage");
    const id = idSchema.parse(roleId);
    await roleService.update(ctx, id, roleSchema.parse(input));
    revalidatePath("/roles");
    revalidatePath(`/roles/${id}`);
  });
}

export async function deleteRoleAction(roleId: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    const ctx = await requirePermission("roles:manage");
    await roleService.remove(ctx, idSchema.parse(roleId));
  });
  if (result.ok) {
    revalidatePath("/roles");
    redirect("/roles?deleted=1");
  }
  return result;
}
