import type { Metadata } from "next";
import Link from "next/link";
import { tokenSchema } from "@/lib/validation";
import { AuthCard } from "@/features/auth/auth-card";
import { FormStatus } from "@/features/auth/form-status";
import { ResetPasswordForm } from "@/features/auth/reset-password-form";
import { authTokenService } from "@/server/services/auth-token.service";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const parsed = tokenSchema.safeParse((await searchParams).token);
  const valid = parsed.success && (await authTokenService.peek(parsed.data, "PASSWORD_RESET")) !== null;

  if (!parsed.success || !valid) {
    return (
      <AuthCard
        title="This link has expired"
        footer={
          <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
            Request a new link
          </Link>
        }
      >
        <FormStatus tone="error" message="Reset links work once and expire after 1 hour." />
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm token={parsed.data} />
    </AuthCard>
  );
}
