import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <LoginForm />
    </main>
  );
}
