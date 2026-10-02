import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

export const notificationPreferenceRepository = {
  listForUser(companyId: string, userId: string, client: DbClient = db) {
    return client.notificationPreference.findMany({
      where: { companyId, userId },
      select: { type: true, inApp: true, email: true },
    });
  },

  /** Saved choices of several users for one type (users without a row use the defaults). */
  listForType(companyId: string, userIds: readonly string[], type: string, client: DbClient = db) {
    return client.notificationPreference.findMany({
      where: { companyId, type, userId: { in: [...userIds] } },
      select: { userId: true, inApp: true, email: true },
    });
  },

  upsert(
    companyId: string,
    userId: string,
    preference: { type: string; inApp: boolean; email: boolean },
    client: DbClient = db,
  ) {
    return client.notificationPreference.upsert({
      where: { companyId_userId_type: { companyId, userId, type: preference.type } },
      create: { companyId, userId, ...preference },
      update: { inApp: preference.inApp, email: preference.email },
    });
  },
};
