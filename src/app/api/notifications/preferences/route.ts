import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { notificationPreferencesSchema } from "@/lib/validation";
import { notificationService } from "@/server/services/notification.service";

/** Your channels (in-app, email) per notification type. */
export const GET = handle(async () => {
  const ctx = await requireTenant();
  return NextResponse.json(await notificationService.preferences(ctx));
});

export const PUT = handle(async (req: Request) => {
  const ctx = await requireTenant();
  await notificationService.savePreferences(ctx, notificationPreferencesSchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});
