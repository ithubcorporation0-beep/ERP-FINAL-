import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { crossTenant, db } from "@/lib/db";
import type { DbClient } from "./helpers";

export interface OutboxData {
  userId: string;
  notificationId: string | null;
  recipient: string;
  subject: string;
  body: string;
  link: string | null;
  dedupeKey: string | null;
}

const claimedRows = z.array(z.object({ id: z.string() }));

/**
 * The email outbox. Rows are written by a company's events (scoped by company) and delivered by the dispatcher,
 * which works across all companies — those queries are explicit `crossTenant` calls.
 */
export const emailOutboxRepository = {
  createMany(companyId: string, rows: readonly OutboxData[], client: DbClient = db) {
    if (rows.length === 0) return Promise.resolve({ count: 0 });
    // Rows whose (company, user, dedupe key) already exists are skipped: one email per user and event.
    return client.emailOutbox.createMany({
      data: rows.map((row) => ({ ...row, companyId })),
      skipDuplicates: true,
    });
  },

  /**
   * Claims up to `limit` due emails for this dispatcher run (SELECT … FOR UPDATE SKIP LOCKED inside the caller's
   * transaction), so two dispatchers never send the same email. Raw SQL: deliberately all companies.
   */
  async claimDue(limit: number, maxAttempts: number, client: DbClient) {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT id::text AS id FROM email_outbox
      WHERE status = 'PENDING' AND next_attempt_at <= now() AND attempts < ${maxAttempts}
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED`);
    const ids = claimedRows.parse(rows).map((row) => row.id);
    if (ids.length === 0) return [];
    return crossTenant("email dispatcher reads the claimed outbox rows of every company", () =>
      client.emailOutbox.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          companyId: true,
          recipient: true,
          subject: true,
          body: true,
          link: true,
          attempts: true,
        },
      }),
    );
  },

  markSent(id: string, client: DbClient = db) {
    return crossTenant("email dispatcher marks a delivered email", () =>
      client.emailOutbox.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      }),
    );
  },

  markAttemptFailed(
    id: string,
    data: { attempts: number; failed: boolean; nextAttemptAt: Date; error: string },
    client: DbClient = db,
  ) {
    return crossTenant("email dispatcher records a failed delivery", () =>
      client.emailOutbox.update({
        where: { id },
        data: {
          attempts: data.attempts,
          status: data.failed ? "FAILED" : "PENDING",
          nextAttemptAt: data.nextAttemptAt,
          lastError: data.error.slice(0, 1000),
        },
      }),
    );
  },

  listForCompany(companyId: string, limit: number, client: DbClient = db) {
    return client.emailOutbox.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, recipient: true, subject: true, status: true, attempts: true, createdAt: true },
    });
  },
};
