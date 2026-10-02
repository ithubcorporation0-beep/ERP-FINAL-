import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { NotificationListQuery } from "@/lib/validation";
import { pageArgs, toPage, type DbClient } from "./helpers";

const select = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
} as const;

export interface NotificationData {
  userId: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  dedupeKey: string | null;
}

/** A user's notifications. Every query is scoped to one company AND one user. */
export const notificationRepository = {
  countUnread(companyId: string, userId: string, client: DbClient = db) {
    return client.notification.count({ where: { companyId, userId, readAt: null } });
  },

  async list(companyId: string, userId: string, query: NotificationListQuery, client: DbClient = db) {
    const where: Prisma.NotificationWhereInput = {
      companyId,
      userId,
      ...(query.status === "unread" ? { readAt: null } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await Promise.all([
      client.notification.findMany({ where, select, orderBy: { createdAt: "desc" }, ...pageArgs(query) }),
      client.notification.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  recent(companyId: string, userId: string, limit: number, client: DbClient = db) {
    return client.notification.findMany({
      where: { companyId, userId },
      select,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  },

  findOwn(companyId: string, userId: string, id: string, client: DbClient = db) {
    return client.notification.findFirst({ where: { id, companyId, userId }, select });
  },

  /**
   * Inserts notifications; rows whose (company, user, dedupe key) already exists are skipped
   * (INSERT … ON CONFLICT DO NOTHING). Returns only the rows actually created.
   */
  createMany(companyId: string, rows: readonly NotificationData[], client: DbClient = db) {
    return client.notification.createManyAndReturn({
      data: rows.map((row) => ({ ...row, companyId })),
      skipDuplicates: true,
      select: { id: true, userId: true, type: true, title: true, body: true, link: true },
    });
  },

  setRead(companyId: string, userId: string, ids: readonly string[], read: boolean, client: DbClient = db) {
    return client.notification.updateMany({
      where: { companyId, userId, id: { in: [...ids] } },
      data: { readAt: read ? new Date() : null },
    });
  },

  markAllRead(companyId: string, userId: string, client: DbClient = db) {
    return client.notification.updateMany({
      where: { companyId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
};
