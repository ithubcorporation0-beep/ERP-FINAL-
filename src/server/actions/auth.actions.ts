"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/config/navigation";
import { runAction, type ActionResult } from "@/lib/action";
import { requestClientInfo } from "@/lib/auth/request";
import { createSession, destroySession } from "@/lib/auth/session";
import { ValidationError } from "@/lib/errors";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from "@/lib/validation";
import { authService } from "@/server/services/auth.service";

const LOGIN_MESSAGES = {
  invalid: "Invalid email or password.",
  locked: "Too many failed attempts. Your account is locked for 15 minutes — or reset your password.",
  unverified: "Please verify your email address first. We've sent you a new verification link.",
} as const;

/** Signs in and redirects to `next` (same-site only) or the user's landing page. */
export async function loginAction(input: unknown, next?: string | null): Promise<ActionResult<string>> {
  const result = await runAction(async () => {
    const credentials = loginSchema.parse(input);
    const info = await requestClientInfo();
    const outcome = await authService.verifyCredentials(credentials, info);
    if (!outcome.ok) throw new ValidationError(LOGIN_MESSAGES[outcome.reason]);
    await createSession(outcome.user.id, info);
    return safeNextPath(next) ?? (await authService.landingPathFor(outcome.user.id));
  });
  if (result.ok) redirect(result.data);
  return result;
}

export async function logoutAction(): Promise<void> {
  const info = await requestClientInfo();
  const userId = await destroySession();
  if (userId) await authService.recordLogout(userId, info);
  redirect("/login");
}

export async function registerAction(input: unknown): Promise<ActionResult<{ emailSent: boolean }>> {
  return runAction(async () => authService.register(registerSchema.parse(input), await requestClientInfo()));
}

/** Always reports success so the form can't be used to discover which emails have accounts. */
export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { email } = forgotPasswordSchema.parse(input);
    await authService.requestPasswordReset(email, await requestClientInfo());
  });
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await authService.resetPassword(resetPasswordSchema.parse(input), await requestClientInfo());
  });
  if (result.ok) redirect("/login?reset=1");
  return result;
}

/** Verification is a button press (POST), not a page view — link scanners must not consume the token. */
export async function verifyEmailAction(token: unknown): Promise<ActionResult> {
  const result = await runAction(async () => {
    await authService.verifyEmail(tokenSchema.parse(token), await requestClientInfo());
  });
  if (result.ok) redirect("/login?verified=1");
  return result;
}

/** Accepts an invitation and signs the new user in. */
export async function acceptInvitationAction(input: unknown): Promise<ActionResult<string>> {
  const result = await runAction(async () => {
    const info = await requestClientInfo();
    const user = await authService.acceptInvitation(acceptInvitationSchema.parse(input), info);
    await createSession(user.id, info);
    return authService.landingPathFor(user.id);
  });
  if (result.ok) redirect(result.data);
  return result;
}
