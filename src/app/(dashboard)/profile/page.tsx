import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/account/change-password-form";
import { ProfileForm } from "@/features/account/profile-form";
import { SessionsList } from "@/features/account/sessions-list";
import { getCurrentSession } from "@/lib/auth/session";
import { accountService } from "@/server/services/account.service";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  // Every signed-in user may open their own profile; no extra permission is needed.
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [profile, sessions] = await Promise.all([
    accountService.getProfile(session.user.id),
    accountService.listSessions(session.user.id),
  ]);
  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <PageHeader title="Your profile" description="Your personal details, password and signed-in devices." />

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your email address identifies your account and can only be changed by an administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium break-all">{profile.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email status</p>
            {profile.emailVerifiedAt ? (
              <StatusBadge tone="success">Verified</StatusBadge>
            ) : (
              <StatusBadge tone="warning">Not verified</StatusBadge>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Member since</p>
            <p className="font-medium">{dateFormat.format(profile.createdAt)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm defaults={{ name: profile.name, phone: profile.phone, jobTitle: profile.jobTitle }} />
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            {profile.passwordChangedAt
              ? `Last changed ${dateFormat.format(profile.passwordChangedAt)}.`
              : "Choose a long password you don't use anywhere else."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card className="shadow-xs">
        <CardHeader>
          <CardTitle>Signed-in devices</CardTitle>
          <CardDescription>
            Sessions end after 7 days without activity and after 30 days at most.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsList
            sessions={sessions.map((row) => ({
              id: row.id,
              createdAt: row.createdAt.toISOString(),
              lastUsedAt: row.lastUsedAt.toISOString(),
              ipAddress: row.ipAddress,
              userAgent: row.userAgent,
              current: row.id === session.sessionId,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
