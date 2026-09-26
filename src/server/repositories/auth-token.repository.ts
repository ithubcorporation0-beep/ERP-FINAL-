import type { AuthTokenType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

export const authTokenRepository = {
  create(
    data: {
      userId: string;
      type: AuthTokenType;
      tokenHash: string;
      expiresAt: Date;
      companyId?: string | null;
      createdById?: string | null;
    },
    client: DbClient = db,
  ) {
    return client.authToken.create({ data, select: { id: true } });
  },

  /**
   * Atomically marks an unused, unexpired token as used and returns it — so a link works exactly once,
   * even if clicked twice at the same moment. Returns null if it is invalid, used or expired.
   */
  async consume(tokenHash: string, type: AuthTokenType, client: DbClient = db) {
    const now = new Date();
    const { count } = await client.authToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) return null;
    return client.authToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, companyId: true, type: true },
    });
  },

  /** Unused, unexpired token without consuming it (to show the right page before the form is submitted). */
  findValid(tokenHash: string, type: AuthTokenType, client: DbClient = db) {
    return client.authToken.findFirst({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userId: true,
        companyId: true,
        user: { select: { email: true, name: true } },
        company: { select: { name: true } },
      },
    });
  },

  /** Invalidates all open tokens of a type for a user (e.g. older reset links when a new one is sent). */
  revokeOpen(userId: string, type: AuthTokenType, client: DbClient = db) {
    return client.authToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
  },

  countRecent(userId: string, type: AuthTokenType, since: Date, client: DbClient = db) {
    return client.authToken.count({ where: { userId, type, createdAt: { gte: since } } });
  },
};
