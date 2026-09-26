import { NotFoundError } from "@/lib/errors";
import type { ProfileInput } from "@/lib/validation";
import { sessionRepository } from "@/server/repositories/session.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { recordAuditEvent } from "./audit.service";

/** The signed-in user's own account: profile and sessions. Every function is scoped to `userId`. */
export const accountService = {
  async getProfile(userId: string) {
    const profile = await userRepository.findProfile(userId);
    if (!profile) throw new NotFoundError("Account");
    return profile;
  },

  async updateProfile(userId: string, input: ProfileInput) {
    const before = await this.getProfile(userId);
    const after = await userRepository.update(
      userId,
      { name: input.name, phone: input.phone || null, jobTitle: input.jobTitle || null },
      userId,
    );
    await recordAuditEvent({
      action: "user.profile_update",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      before: { name: before.name, phone: before.phone, jobTitle: before.jobTitle },
      after: { name: after.name, phone: after.phone, jobTitle: after.jobTitle },
    });
    return after;
  },

  listSessions(userId: string) {
    return sessionRepository.listActive(userId);
  },

  async revokeSession(userId: string, sessionId: string) {
    const { count } = await sessionRepository.deleteForUser(userId, sessionId);
    if (count === 0) throw new NotFoundError("Session");
    await recordAuditEvent({
      action: "auth.session_revoked",
      entityType: "Session",
      entityId: sessionId,
      actorId: userId,
    });
  },

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    const { count } = await sessionRepository.deleteAllForUser(userId, currentSessionId);
    await recordAuditEvent({
      action: "auth.sessions_revoked",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      metadata: { count },
    });
    return count;
  },
};
