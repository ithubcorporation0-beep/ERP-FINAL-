import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { siteConfig } from "@/config/site";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/60 px-4 py-10">
      <Logo href="/login" />
      <LoginForm />
      <p className="text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {siteConfig.name}. Access is restricted to authorized users.
      </p>
    </main>
  );
}
