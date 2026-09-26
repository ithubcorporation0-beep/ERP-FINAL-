import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/config/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthCard } from "@/features/auth/auth-card";
import { LoginForm } from "@/features/auth/login-form";
import { authService } from "@/server/services/auth.service";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  reset: "Your password was changed. Sign in with your new password.",
  verified: "Your email is verified. You can sign in now.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  const user = await getCurrentUser();
  if (user) redirect(next ?? (await authService.landingPathFor(user.id)));

  const notice = Object.keys(NOTICES).find((key) => params[key] === "1");
  return (
    <AuthCard
      title="Sign in"
      description="Use your company account to continue."
      footer={
        authService.registrationEnabled() ? (
          <span>
            New to IT Hub ERP?{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </span>
        ) : undefined
      }
    >
      <LoginForm next={next} notice={notice ? NOTICES[notice] : undefined} />
    </AuthCard>
  );
}
