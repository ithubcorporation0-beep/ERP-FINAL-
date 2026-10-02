import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PreferencesForm } from "@/features/notifications/preferences-form";
import { authorizePage } from "@/lib/auth/page";
import { notificationService } from "@/server/services/notification.service";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationPreferencesPage() {
  const ctx = await authorizePage();
  if (!ctx) return <AccessDenied />;
  const preferences = await notificationService.preferences(ctx);

  return (
    <>
      <PageHeader
        title="Notification settings"
        description="Choose how you hear about each event in this company. Emails go to your account's email address. You only get notifications for things your role can see."
      />
      <Card className="shadow-xs">
        <CardContent>
          <PreferencesForm
            initial={preferences.map((row) => ({
              type: row.type,
              label: row.label,
              audience: row.audience,
              inApp: row.inApp,
              email: row.email,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
