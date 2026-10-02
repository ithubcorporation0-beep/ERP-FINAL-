import type { Metadata } from "next";
import { Settings } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { isNotificationType, NOTIFICATION_TYPE_DEFINITIONS } from "@/config/notifications";
import { NotificationList } from "@/features/notifications/notification-list";
import { authorizePage } from "@/lib/auth/page";
import { formatDateTime } from "@/lib/format";
import { notificationListQuerySchema } from "@/lib/validation";
import { companyService } from "@/server/services/company.service";
import { notificationService } from "@/server/services/notification.service";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  // Every signed-in member has a notification center; it only ever shows their own notifications.
  const ctx = await authorizePage();
  if (!ctx) return <AccessDenied />;
  const query = notificationListQuerySchema
    .catch(notificationListQuerySchema.parse({}))
    .parse(await searchParams);
  const [result, unread, format] = await Promise.all([
    notificationService.list(ctx, query),
    notificationService.unreadCount(ctx),
    companyService.formatting(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What happened in your company that concerns you. Choose what you get, and how, in the settings."
        actions={
          <Button asChild variant="outline">
            <Link href="/notifications/preferences">
              <Settings aria-hidden="true" />
              Settings
            </Link>
          </Button>
        }
      />
      <NotificationList
        unread={unread}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        rows={result.items.map((item) => ({
          id: item.id,
          typeLabel: isNotificationType(item.type)
            ? NOTIFICATION_TYPE_DEFINITIONS[item.type].label
            : "Notice",
          title: item.title,
          body: item.body,
          hasLink: Boolean(item.link),
          read: item.readAt !== null,
          at: item.createdAt.toISOString(),
          atLabel: formatDateTime(item.createdAt, format),
        }))}
      />
    </>
  );
}
