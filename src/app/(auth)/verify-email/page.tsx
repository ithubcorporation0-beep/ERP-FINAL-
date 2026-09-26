import type { Metadata } from "next";
import Link from "next/link";
import { tokenSchema } from "@/lib/validation";
import { AuthCard } from "@/features/auth/auth-card";
import { FormStatus } from "@/features/auth/form-status";
import { VerifyEmailButton } from "@/features/auth/verify-email-button";
import { authTokenService } from "@/server/services/auth-token.service";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const parsed = tokenSchema.safeParse((await searchParams).token);
  const valid = parsed.success && (await authTokenService.peek(parsed.data, "EMAIL_VERIFICATION")) !== null;

  if (!parsed.success || !valid) {
    return (
      <AuthCard
        title="This link has expired"
        footer={
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in to get a new link
          </Link>
        }
      >
        <FormStatus
          tone="error"
          message="Verification links work once and expire after 24 hours. Signing in sends a new one."
        />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Verify your email" description="Confirm that this email address belongs to you.">
      <VerifyEmailButton token={parsed.data} />
    </AuthCard>
  );
}
