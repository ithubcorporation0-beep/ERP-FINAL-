import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

export const notificationRepository = {
  countUnread(companyId: string, userId: string, client: DbClient = db) {
    return client.notification.count({ where: { companyId, userId, readAt: null } });
  },
};
