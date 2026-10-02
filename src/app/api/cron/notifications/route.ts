import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { getServerEnv } from "@/lib/env";
import { NotFoundError, UnauthenticatedError } from "@/lib/errors";
import { notificationScheduleService } from "@/server/services/notification-schedule.service";
import { notificationService } from "@/server/services/notification.service";

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

/**
 * Scheduler hook for an external cron (every few minutes): reminders for every company, then email delivery.
 * Protected by CRON_SECRET ("Authorization: Bearer <secret>"); disabled (404) when CRON_SECRET isn't set.
 * No user session is involved, so it does not touch any company's data beyond notifications.
 */
export const POST = handle(async (req: Request) => {
  const secret = getServerEnv().CRON_SECRET;
  if (!secret) throw new NotFoundError("Endpoint");
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !sameSecret(token, secret)) throw new UnauthenticatedError();
  const reminders = await notificationScheduleService.runAll();
  const emails = await notificationService.dispatchEmails(200);
  return NextResponse.json({
    companies: reminders.length,
    failures: reminders.filter((r) => r.error).length,
    emails,
  });
});
