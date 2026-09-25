"use server";

import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validation";
import { authService } from "@/server/services/auth.service";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const user = await authService.login(parsed.data);
  if (!user) return { error: "Invalid email or password." };

  redirect("/dashboard");
}

export async function logoutAction() {
  await authService.logout();
  redirect("/login");
}
