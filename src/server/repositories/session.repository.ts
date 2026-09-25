import { db } from "@/lib/db";

export const sessionRepository = {
  create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return db.session.create({ data, select: { id: true } });
  },

  /** Session plus the minimal user fields needed to authenticate a request. */
  findByTokenHash(tokenHash: string) {
    return db.session.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        expiresAt: true,
        user: { select: { id: true, name: true, email: true, status: true } },
      },
    });
  },

  deleteByTokenHash(tokenHash: string) {
    return db.session.deleteMany({ where: { tokenHash } });
  },

  deleteExpired(now = new Date()) {
    return db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  },
};
