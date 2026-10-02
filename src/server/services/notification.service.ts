import "server-only";
import {
  MAX_EMAIL_ATTEMPTS,
  NOTIFICATION_TYPE_DEFINITIONS,
  NOTIFICATION_TYPES,
  type NotificationTypeKey,
} from "@/config/notifications";
import { db } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { resolveChannels, retryDelayMinutes } from "@/lib/notifications";
import type { TenantContext } from "@/lib/tenant";
import type { NotificationListQuery, NotificationPreferencesInput } from "@/lib/validation";
import { companyRepository } from "@/server/repositories/company.repository";
import { emailOutboxRepository } from "@/server/repositories/email-outbox.repository";
import type { DbClient } from "@/server/repositories/helpers";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { notificationPreferenceRepository } from "@/server/repositories/notification-preference.repository";
import { notificationRepository } from "@/server/repositories/notification.repository";
import { writeAuditLog } from "./audit.service";

/**
 * Notifications (docs/notifications.md).
 * - `notify()` is called by the modules inside the transaction of the event (a new invoice, a leave decision…).
 *   It picks the recipients — the type's permission audience, or explicit users — drops the actor, applies each
 *   user's channel preferences, and writes in-app notifications and email outbox rows in that same transaction.
 *   If the event rolls back, so do its notifications.
 * - Emails are delivered afterwards by `dispatchEmails()` (cron route / script), with retries. WhatsApp and SMS
 *   would be further outbox channels; they are not implemented.
 * - Users only ever read and change their own notifications and preferences.
 */

export interface NotificationEvent {
  type: NotificationTypeKey;
  title: string;
  body?: string | null;
  /** App path, e.g. "/sales/invoices/<id>". */
  link?: string | null;
  entityType?: string;
  entityId?: string;
  /** For once-per-event notifications (reminders): a key unique per user — see `dedupeKey()`. */
  dedupeKey?: string;
  /** Specific recipients (user ids). Without it, members with the type's permission receive it. */
  userIds?: readonly string[];
  /** Never notify these users — usually whoever caused the event. */
  excludeUserIds?: ReadonlyArray<string | null>;
}

async function recipients(companyId: string, event: NotificationEvent, client: DbClient) {
  const definition = NOTIFICATION_TYPE_DEFINITIONS[event.type];
  const users = event.userIds
    ? event.userIds.length > 0
      ? await membershipRepository.listActiveUsersByIds(companyId, event.userIds, client)
      : []
    : definition.permission
      ? await membershipRepository.listUsersWithPermission(companyId, definition.permission, client)
      : [];
  const unique = new Map(users.map((user) => [user.id, user]));
  for (const userId of event.excludeUserIds ?? []) if (userId) unique.delete(userId);
  return [...unique.values()];
}

/** Writes an event's in-app notifications and queued emails. Returns how many of each were created. */
export async function notify(companyId: string, event: NotificationEvent, client: DbClient = db) {
  const users = await recipients(companyId, event, client);
  if (users.length === 0) return { inApp: 0, email: 0 };
  const saved = await notificationPreferenceRepository.listForType(
    companyId,
    users.map((user) => user.id),
    event.type,
    client,
  );
  const defaults = NOTIFICATION_TYPE_DEFINITIONS[event.type].defaults;
  const channels = new Map(
    users.map((user) => [
      user.id,
      resolveChannels(
        defaults,
        saved.find((row) => row.userId === user.id),
      ),
    ]),
  );
  const common = {
    type: event.type,
    title: event.title,
    body: event.body ?? null,
    link: event.link ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    dedupeKey: event.dedupeKey ?? null,
  };
  const created = await notificationRepository.createMany(
    companyId,
    users.filter((user) => channels.get(user.id)?.inApp).map((user) => ({ ...common, userId: user.id })),
    client,
  );

  const emailUsers = users.filter((user) => channels.get(user.id)?.email);
  let emails = 0;
  if (emailUsers.length > 0) {
    const company = await companyRepository.findProfile(companyId, client);
    const companyName = company?.name ?? "your company";
    const { count } = await emailOutboxRepository.createMany(
      companyId,
      emailUsers.map((user) => ({
        userId: user.id,
        notificationId: created.find((row) => row.userId === user.id)?.id ?? null,
        recipient: user.email,
        subject: `${event.title} — ${companyName}`,
        body: [
          `Hi ${user.name},`,
          event.title,
          ...(event.body ? [event.body] : []),
          `You get this email because of your notification settings in ${companyName}. You can change them under Notifications → Settings.`,
        ].join("\n\n"),
        link: event.link ?? null,
        dedupeKey: event.dedupeKey ?? null,
      })),
      client,
    );
    emails = count;
  }
  return { inApp: created.length, email: emails };
}

export const notificationService = {
  async list(ctx: TenantContext, query: NotificationListQuery) {
    return notificationRepository.list(ctx.companyId, ctx.userId, query);
  },

  async recent(ctx: TenantContext, limit = 8) {
    const [items, unread] = await Promise.all([
      notificationRepository.recent(ctx.companyId, ctx.userId, limit),
      notificationRepository.countUnread(ctx.companyId, ctx.userId),
    ]);
    return { items, unread };
  },

  unreadCount(ctx: TenantContext) {
    return notificationRepository.countUnread(ctx.companyId, ctx.userId);
  },

  /** Marks the user's own notifications read or unread (other users' ids are simply not matched). */
  async setRead(ctx: TenantContext, ids: readonly string[], read: boolean) {
    const { count } = await notificationRepository.setRead(ctx.companyId, ctx.userId, ids, read);
    return count;
  },

  async markAllRead(ctx: TenantContext) {
    const { count } = await notificationRepository.markAllRead(ctx.companyId, ctx.userId);
    return count;
  },

  /** Opening a notification marks it read and returns where to go. */
  async open(ctx: TenantContext, id: string) {
    const notification = await notificationRepository.findOwn(ctx.companyId, ctx.userId, id);
    if (!notification) throw new NotFoundError("Notification");
    if (!notification.readAt) await notificationRepository.setRead(ctx.companyId, ctx.userId, [id], true);
    return notification.link ?? "/notifications";
  },

  /** Every type with the user's channels (saved choice or default). */
  async preferences(ctx: TenantContext) {
    const saved = await notificationPreferenceRepository.listForUser(ctx.companyId, ctx.userId);
    return NOTIFICATION_TYPES.map((type) => ({
      type,
      ...NOTIFICATION_TYPE_DEFINITIONS[type],
      ...resolveChannels(
        NOTIFICATION_TYPE_DEFINITIONS[type].defaults,
        saved.find((row) => row.type === type),
      ),
    }));
  },

  async savePreferences(ctx: TenantContext, input: NotificationPreferencesInput) {
    await db.$transaction(async (tx) => {
      for (const preference of input.preferences) {
        await notificationPreferenceRepository.upsert(ctx.companyId, ctx.userId, preference, tx);
      }
      await writeAuditLog(
        ctx,
        {
          action: "notification.preferences_update",
          entityType: "User",
          entityId: ctx.userId,
          after: input.preferences,
        },
        tx,
      );
    });
  },

  /**
   * Delivers due emails from the outbox (all companies). Each batch is claimed with FOR UPDATE SKIP LOCKED so
   * parallel runs never send twice; failures are retried with growing delays and give up after
   * MAX_EMAIL_ATTEMPTS. Returns what happened.
   */
  async dispatchEmails(limit = 50) {
    return db.$transaction(
      async (tx) => {
        const due = await emailOutboxRepository.claimDue(limit, MAX_EMAIL_ATTEMPTS, tx);
        let sent = 0;
        let failed = 0;
        for (const row of due) {
          try {
            await sendEmail(
              emailTemplates.notification(row.recipient, {
                subject: row.subject,
                paragraphs: row.body.split("\n\n"),
                url: row.link ? appUrl(row.link) : null,
              }),
            );
            await emailOutboxRepository.markSent(row.id, tx);
            sent += 1;
          } catch (error) {
            const attempts = row.attempts + 1;
            const message = error instanceof Error ? error.message : String(error);
            logger.warn("Notification email failed", { outboxId: row.id, attempts, error: message });
            await emailOutboxRepository.markAttemptFailed(
              row.id,
              {
                attempts,
                failed: attempts >= MAX_EMAIL_ATTEMPTS,
                nextAttemptAt: new Date(Date.now() + retryDelayMinutes(attempts) * 60_000),
                error: message,
              },
              tx,
            );
            failed += 1;
          }
        }
        return { claimed: due.length, sent, failed };
      },
      { timeout: 120_000 },
    );
  },
};
