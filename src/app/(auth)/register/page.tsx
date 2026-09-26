import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/features/auth/auth-card";
import { FormStatus } from "@/features/auth/form-status";
import { RegisterForm } from "@/features/auth/register-form";
import { authService } from "@/server/services/auth.service";

export const metadata: Metadata = { title: "Create account" };

const signInLink = (
  <Link href="/login" className="text-primary underline-offset-4 hover:underline">
    Back to sign in
  </Link>
);

export default function RegisterPage() {
  if (!authService.registrationEnabled()) {
    return (
      <AuthCard title="Registration is closed" footer={signInLink}>
        <FormStatus
          tone="success"
          message="New accounts are created by invitation. Ask your company administrator."
        />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Create your company account"
      description="You'll be the Super Admin and can invite your team afterwards."
      footer={signInLink}
    >
      <RegisterForm />
    </AuthCard>
  );
}
