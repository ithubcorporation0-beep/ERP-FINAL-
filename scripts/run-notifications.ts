/**
 * Runs the notification scheduler once: time-based reminders (overdue invoices, task and project deadlines) for
 * every active company, then delivers due emails from the outbox. Schedule it every few minutes with the server's
 * cron (a crontab line like "every 5 minutes: cd /srv/erp && npm run notifications:run"). Safe to run
 * concurrently or repeatedly.
 */
import "dotenv/config";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notificationScheduleService } from "@/server/services/notification-schedule.service";
import { notificationService } from "@/server/services/notification.service";

async function main() {
  const reminders = await notificationScheduleService.runAll();
  const emails = await notificationService.dispatchEmails(200);
  logger.info("Notification run finished", { companies: reminders.length, emails });
  if (reminders.some((result) => result.error)) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    logger.error("Notification run failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
