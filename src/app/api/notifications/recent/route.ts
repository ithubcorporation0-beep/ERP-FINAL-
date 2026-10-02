import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { notificationService } from "@/server/services/notification.service";

/** The latest notifications and the unread count (header bell). */
export const GET = handle(async () => {
  const ctx = await requireTenant();
  return NextResponse.json(await notificationService.recent(ctx), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
