import { db } from "@/lib/db";

export const notificationRepository = {
  countUnread(organizationId: string, userId: string) {
    return db.notification.count({ where: { organizationId, userId, readAt: null } });
  },
};
