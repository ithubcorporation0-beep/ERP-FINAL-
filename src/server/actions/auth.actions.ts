"use server";

import { redirect } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { authService } from "@/server/services/auth.service";

export type LoginResult = { error: string } | undefined;

export async function loginAction(input: LoginInput): Promise<LoginResult> {
  // Re-validate on the server: client-side validation can be bypassed.
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const user = await authService.login(parsed.data);
  if (!user) return { error: "Invalid email or password." };

  redirect("/dashboard");
}

export async function logoutAction() {
  await authService.logout();
  redirect("/login");
}
