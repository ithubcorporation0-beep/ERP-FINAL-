import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { notificationListQuerySchema, notificationReadSchema } from "@/lib/validation";
import { notificationService } from "@/server/services/notification.service";

/** The signed-in user's own notifications (`?status=unread&type=…&page=`). */
export const GET = handle(async (req: Request) => {
  const ctx = await requireTenant();
  const query = notificationListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await notificationService.list(ctx, query));
});

/** `{ ids, read }` marks some of your notifications read / unread; `{ all: true }` marks all read. */
export const PATCH = handle(async (req: Request) => {
  const ctx = await requireTenant();
  const input = notificationReadSchema.parse(await req.json());
  const updated =
    "all" in input
      ? await notificationService.markAllRead(ctx)
      : await notificationService.setRead(ctx, input.ids, input.read);
  return NextResponse.json({ updated });
});
