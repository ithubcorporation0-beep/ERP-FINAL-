import { verifyPassword } from "@/lib/auth/password";
import { requestClientInfo } from "@/lib/auth/request";
import { createSession, destroySession } from "@/lib/auth/session";
import type { LoginInput } from "@/lib/validation";
import { userRepository } from "@/server/repositories/user.repository";
import { recordAuditEvent } from "./audit.service";

export const authService = {
  /** Verifies credentials and starts a session. Returns null on invalid credentials (both are audited). */
  async login({ email, password }: LoginInput) {
    const client = await requestClientInfo();
    const user = await userRepository.findByEmail(email);
    const valid =
      user !== null && user.status === "ACTIVE" && (await verifyPassword(password, user.passwordHash));

    if (!user || !valid) {
      await recordAuditEvent({
        action: "auth.login_failed",
        entityType: "User",
        entityId: user?.id ?? null,
        metadata: { email: email.toLowerCase() },
        ...client,
      });
      return null;
    }

    await userRepository.touchLastLogin(user.id);
    await createSession(user.id, client);
    await recordAuditEvent({
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      ...client,
    });
    return { id: user.id, email: user.email, name: user.name };
  },

  async logout() {
    const client = await requestClientInfo();
    const userId = await destroySession();
    if (userId) {
      await recordAuditEvent({
        action: "auth.logout",
        entityType: "User",
        entityId: userId,
        actorId: userId,
        ...client,
      });
    }
  },
};
