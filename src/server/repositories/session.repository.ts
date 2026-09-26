import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

export const sessionRepository = {
  create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return db.session.create({ data, select: { id: true } });
  },

  /** Session plus the user fields needed to authenticate a request. */
  findByTokenHash(tokenHash: string) {
    return db.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        absoluteExpiresAt: true,
        lastUsedAt: true,
        user: { select: { id: true, name: true, email: true, status: true, emailVerifiedAt: true } },
      },
    });
  },

  touch(id: string, expiresAt: Date) {
    return db.session.update({
      where: { id },
      data: { lastUsedAt: new Date(), expiresAt },
      select: { id: true },
    });
  },

  listActive(userId: string, now = new Date()) {
    return db.session.findMany({
      where: { userId, expiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, createdAt: true, lastUsedAt: true, ipAddress: true, userAgent: true },
    });
  },

  deleteByTokenHash(tokenHash: string) {
    return db.session.deleteMany({ where: { tokenHash } });
  },

  /** Deletes one session, only if it belongs to `userId`. */
  deleteForUser(userId: string, id: string) {
    return db.session.deleteMany({ where: { id, userId } });
  },

  /** Signs the user out everywhere, optionally keeping one session (the current one). */
  deleteAllForUser(userId: string, exceptId?: string, client: DbClient = db) {
    return client.session.deleteMany({ where: { userId, ...(exceptId ? { id: { not: exceptId } } : {}) } });
  },

  deleteExpired(now = new Date()) {
    return db.session.deleteMany({
      where: { OR: [{ expiresAt: { lt: now } }, { absoluteExpiresAt: { lt: now } }] },
    });
  },
};
