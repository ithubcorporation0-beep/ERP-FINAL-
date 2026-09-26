"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requestClientInfo } from "@/lib/auth/request";
import { getCurrentSession } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/errors";
import { changePasswordSchema, idSchema, profileSchema } from "@/lib/validation";
import { accountService } from "@/server/services/account.service";
import { authService } from "@/server/services/auth.service";

async function requireSession() {
  const session = await getCurrentSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireSession();
    await accountService.updateProfile(user.id, profileSchema.parse(input));
    revalidatePath("/", "layout");
  });
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    await authService.changePassword(
      session.user.id,
      session.sessionId,
      changePasswordSchema.parse(input),
      await requestClientInfo(),
    );
    revalidatePath("/profile");
  });
}

export async function revokeSessionAction(sessionId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    const id = idSchema.parse(sessionId);
    await accountService.revokeSession(session.user.id, id);
    revalidatePath("/profile");
  });
}

export async function revokeOtherSessionsAction(): Promise<ActionResult<number>> {
  return runAction(async () => {
    const session = await requireSession();
    const count = await accountService.revokeOtherSessions(session.user.id, session.sessionId);
    revalidatePath("/profile");
    return count;
  });
}

export async function resendVerificationAction(): Promise<ActionResult<{ sent: boolean }>> {
  return runAction(async () => authService.resendVerification((await requireSession()).user.id));
}
