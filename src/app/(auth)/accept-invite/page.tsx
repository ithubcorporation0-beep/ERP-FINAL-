import type { Metadata } from "next";
import Link from "next/link";
import { tokenSchema } from "@/lib/validation";
import { AcceptInviteForm } from "@/features/auth/accept-invite-form";
import { AuthCard } from "@/features/auth/auth-card";
import { FormStatus } from "@/features/auth/form-status";
import { authService } from "@/server/services/auth.service";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitePage({ searchParams }: PageProps<"/accept-invite">) {
  const parsed = tokenSchema.safeParse((await searchParams).token);
  const invitation = parsed.success ? await authService.getInvitation(parsed.data) : null;

  if (!parsed.success || !invitation) {
    return (
      <AuthCard
        title="This invitation is no longer valid"
        footer={
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Go to sign in
          </Link>
        }
      >
        <FormStatus
          tone="error"
          message="Invitations work once and expire after 7 days. Ask your administrator to send a new one."
        />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={invitation.companyName ? `Join ${invitation.companyName}` : "Accept your invitation"}
      description="Set your name and password to activate your account."
    >
      <AcceptInviteForm token={parsed.data} name={invitation.name} email={invitation.email} />
    </AuthCard>
  );
}
