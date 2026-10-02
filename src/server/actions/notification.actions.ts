"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requireTenant } from "@/lib/tenant";
import { idSchema, notificationPreferencesSchema, notificationReadSchema } from "@/lib/validation";
import { notificationService } from "@/server/services/notification.service";

/** Every action works only on the signed-in user's own notifications (the service scopes by user). */

export async function setNotificationsReadAction(input: unknown): Promise<ActionResult<{ updated: number }>> {
  return runAction(async () => {
    const ctx = await requireTenant();
    const parsed = notificationReadSchema.parse(input);
    const updated =
      "all" in parsed
        ? await notificationService.markAllRead(ctx)
        : await notificationService.setRead(ctx, parsed.ids, parsed.read);
    revalidatePath("/", "layout");
    return { updated };
  });
}

/** Marks a notification read and returns where it points. */
export async function openNotificationAction(id: unknown): Promise<ActionResult<{ href: string }>> {
  return runAction(async () => {
    const ctx = await requireTenant();
    const href = await notificationService.open(ctx, idSchema.parse(id));
    revalidatePath("/", "layout");
    return { href };
  });
}

export async function saveNotificationPreferencesAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireTenant();
    await notificationService.savePreferences(ctx, notificationPreferencesSchema.parse(input));
    revalidatePath("/notifications", "layout");
  });
}
