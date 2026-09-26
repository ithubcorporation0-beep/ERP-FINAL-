import { landingPath } from "@/config/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { appUrl, sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";
import { getServerEnv } from "@/lib/env";
import { AppError, ForbiddenError, UnauthenticatedError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type {
  AcceptInvitationInput,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@/lib/validation";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { sessionRepository } from "@/server/repositories/session.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { recordAuditEvent } from "./audit.service";
import { authTokenService } from "./auth-token.service";
import { companyService } from "./company.service";

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
const RESEND_THROTTLE_MS = 60 * 1000;

/** Client details recorded with sessions and audit events. */
export interface RequestInfo {
  ipAddress?: string;
  userAgent?: string;
}

export type LoginResult =
  | { ok: true; user: { id: string; name: string; email: string } }
  | { ok: false; reason: "invalid" | "locked" | "unverified" };

/** Sends an email; a failure is logged and reported to the caller instead of failing the whole flow. */
async function trySend(
  message: Parameters<typeof sendEmail>[0],
  context: Record<string, unknown>,
): Promise<boolean> {
  try {
    await sendEmail(message);
    return true;
  } catch (error) {
    logger.error("Email could not be sent", { ...context, error });
    return false;
  }
}

async function sendVerification(user: { id: string; name: string; email: string }) {
  const token = await authTokenService.issue(user.id, "EMAIL_VERIFICATION");
  return trySend(emailTemplates.verifyEmail(user.email, user.name, appUrl("/verify-email", { token })), {
    userId: user.id,
    kind: "verification",
  });
}

/**
 * Account flows. Services never touch cookies: server actions call `createSession()` / `destroySession()`
 * after a successful result, which keeps these rules testable against the real database.
 */
export const authService = {
  /**
   * Checks credentials with brute-force protection: after LOCKOUT_THRESHOLD consecutive failures the account
   * is locked for LOCKOUT_MS. Unknown emails and wrong passwords get the same answer. Every attempt is audited.
   */
  async verifyCredentials({ email, password }: LoginInput, info: RequestInfo = {}): Promise<LoginResult> {
    const user = await userRepository.findByEmail(email);
    const now = new Date();

    if (user?.lockedUntil && user.lockedUntil > now) {
      await recordAuditEvent({
        action: "auth.login_blocked",
        entityType: "User",
        entityId: user.id,
        ...info,
      });
      return { ok: false, reason: "locked" };
    }

    const passwordOk = user !== null && (await verifyPassword(password, user.passwordHash));
    if (!user || !passwordOk || user.status !== "ACTIVE") {
      if (user && !passwordOk) {
        const failures = await userRepository.recordFailedLogin(user.id);
        if (failures >= LOCKOUT_THRESHOLD) {
          await userRepository.update(
            user.id,
            { lockedUntil: new Date(now.getTime() + LOCKOUT_MS), failedLoginAttempts: 0 },
            null,
          );
          await recordAuditEvent({
            action: "auth.account_locked",
            entityType: "User",
            entityId: user.id,
            ...info,
          });
        }
      }
      await recordAuditEvent({
        action: "auth.login_failed",
        entityType: "User",
        entityId: user?.id ?? null,
        metadata: { email },
        ...info,
      });
      return { ok: false, reason: "invalid" };
    }

    if (!user.emailVerifiedAt) {
      if (!(await authTokenService.issuedRecently(user.id, "EMAIL_VERIFICATION", RESEND_THROTTLE_MS))) {
        await sendVerification(user);
      }
      return { ok: false, reason: "unverified" };
    }

    await userRepository.recordSuccessfulLogin(user.id);
    await recordAuditEvent({
      action: "auth.login",
      entityType: "User",
      entityId: user.id,
      actorId: user.id,
      ...info,
    });
    return { ok: true, user: { id: user.id, name: user.name, email: user.email } };
  },

  /** Where to send a user right after sign-in: the first page their role may open. */
  async landingPathFor(userId: string): Promise<string> {
    const access = await membershipRepository.findAccess(userId);
    return landingPath(access?.permissions ?? []);
  },

  async recordLogout(userId: string, info: RequestInfo = {}) {
    await recordAuditEvent({
      action: "auth.logout",
      entityType: "User",
      entityId: userId,
      actorId: userId,
      ...info,
    });
  },

  registrationEnabled(): boolean {
    return getServerEnv().AUTH_ALLOW_REGISTRATION;
  },

  /**
   * Self-service sign-up: a new company with the registrant as Super Admin. The email must be verified before
   * signing in. If the email already has an account, the same response is returned (no account enumeration)
   * and the owner receives a notice instead.
   */
  async register(input: RegisterInput, info: RequestInfo = {}): Promise<{ emailSent: boolean }> {
    if (!this.registrationEnabled()) throw new ForbiddenError("Registration is disabled.");

    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      await recordAuditEvent({
        action: "auth.register_existing",
        entityType: "User",
        entityId: existing.id,
        ...info,
      });
      const emailSent = await trySend(
        emailTemplates.accountExists(existing.email, appUrl("/forgot-password")),
        {
          userId: existing.id,
          kind: "account-exists",
        },
      );
      return { emailSent };
    }

    const result = await db.$transaction(
      async (tx) => {
        const slug = await companyService.availableSlug(input.companyName, tx);
        return companyService.bootstrap(
          {
            company: { name: input.companyName, slug },
            owner: { email: input.email, name: input.name, password: input.password },
            ownerEmailVerified: false,
          },
          tx,
        );
      },
      { timeout: 30_000 },
    );
    await recordAuditEvent({
      action: "auth.register",
      entityType: "User",
      entityId: result.ownerId,
      actorId: result.ownerId,
      companyId: result.company.id,
      ...info,
    });
    const emailSent = await sendVerification({ id: result.ownerId, name: input.name, email: input.email });
    return { emailSent };
  },

  /** Always "succeeds" from the caller's point of view, so nobody can probe which emails have accounts. */
  async requestPasswordReset(email: string, info: RequestInfo = {}): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user || user.status === "SUSPENDED") return;
    if (await authTokenService.issuedRecently(user.id, "PASSWORD_RESET", RESEND_THROTTLE_MS)) return;

    const token = await authTokenService.issue(user.id, "PASSWORD_RESET");
    await recordAuditEvent({
      action: "auth.password_reset_requested",
      entityType: "User",
      entityId: user.id,
      ...info,
    });
    await trySend(emailTemplates.passwordReset(user.email, user.name, appUrl("/reset-password", { token })), {
      userId: user.id,
      kind: "password-reset",
    });
  },

  /** Sets a new password from a reset link, verifies the email, clears any lockout and signs out everywhere. */
  async resetPassword({ token, password }: ResetPasswordInput, info: RequestInfo = {}) {
    const passwordHash = await hashPassword(password);
    const user = await db.$transaction(async (tx) => {
      const consumed = await authTokenService.consume(token, "PASSWORD_RESET", tx);
      if (!consumed)
        throw new ValidationError("This reset link is invalid or has expired. Request a new one.");
      const current = await userRepository.findById(consumed.userId, tx);
      if (!current || current.status === "SUSPENDED") {
        throw new ValidationError("This reset link is invalid or has expired. Request a new one.");
      }
      const updated = await userRepository.update(
        current.id,
        {
          passwordHash,
          passwordChangedAt: new Date(),
          emailVerifiedAt: current.emailVerifiedAt ?? new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        current.id,
        tx,
      );
      await sessionRepository.deleteAllForUser(current.id, undefined, tx);
      await recordAuditEvent(
        {
          action: "auth.password_reset",
          entityType: "User",
          entityId: current.id,
          actorId: current.id,
          ...info,
        },
        tx,
      );
      return updated;
    });
    await trySend(emailTemplates.passwordChanged(user.email, user.name), {
      userId: user.id,
      kind: "password-changed",
    });
    return { id: user.id };
  },

  async verifyEmail(token: string, info: RequestInfo = {}) {
    return db.$transaction(async (tx) => {
      const consumed = await authTokenService.consume(token, "EMAIL_VERIFICATION", tx);
      if (!consumed) throw new ValidationError("This verification link is invalid or has expired.");
      const user = await userRepository.findById(consumed.userId, tx);
      if (!user) throw new ValidationError("This verification link is invalid or has expired.");
      if (!user.emailVerifiedAt) {
        await userRepository.update(user.id, { emailVerifiedAt: new Date() }, user.id, tx);
      }
      await recordAuditEvent(
        { action: "auth.email_verified", entityType: "User", entityId: user.id, actorId: user.id, ...info },
        tx,
      );
      return { id: user.id };
    });
  },

  /** Resends the verification email to a signed-in, unverified user (throttled). */
  async resendVerification(userId: string): Promise<{ sent: boolean }> {
    const user = await userRepository.findById(userId);
    if (!user || user.emailVerifiedAt) return { sent: false };
    if (await authTokenService.issuedRecently(user.id, "EMAIL_VERIFICATION", RESEND_THROTTLE_MS)) {
      throw new AppError(
        "CONFLICT",
        "A verification email was just sent. Please wait a minute before trying again.",
      );
    }
    return { sent: await sendVerification(user) };
  },

  /** Changes the password of a signed-in user after re-checking the current one; signs out other sessions. */
  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordInput,
    info: RequestInfo = {},
  ) {
    const user = await userRepository.findById(userId);
    if (!user) throw new UnauthenticatedError();
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new ValidationError("Your current password is incorrect.", {
        currentPassword: ["Incorrect password."],
      });
    }
    const passwordHash = await hashPassword(input.password);
    await db.$transaction(async (tx) => {
      await userRepository.update(userId, { passwordHash, passwordChangedAt: new Date() }, userId, tx);
      await sessionRepository.deleteAllForUser(userId, currentSessionId, tx);
      await recordAuditEvent(
        { action: "auth.password_changed", entityType: "User", entityId: userId, actorId: userId, ...info },
        tx,
      );
    });
    await trySend(emailTemplates.passwordChanged(user.email, user.name), {
      userId,
      kind: "password-changed",
    });
  },

  /** Details for the "accept invitation" page, or null if the link is invalid/expired/used. */
  async getInvitation(token: string) {
    const invitation = await authTokenService.peek(token, "INVITATION");
    if (!invitation) return null;
    return {
      email: invitation.user.email,
      name: invitation.user.name,
      companyName: invitation.company?.name ?? null,
    };
  },

  /** Activates an invited account: sets name and password, verifies the email, activates memberships. */
  async acceptInvitation({ token, name, password }: AcceptInvitationInput, info: RequestInfo = {}) {
    const passwordHash = await hashPassword(password);
    return db.$transaction(async (tx) => {
      const consumed = await authTokenService.consume(token, "INVITATION", tx);
      if (!consumed) throw new ValidationError("This invitation is invalid, already used or has expired.");
      const user = await userRepository.findById(consumed.userId, tx);
      if (!user || user.status === "SUSPENDED") {
        throw new ValidationError("This invitation is invalid, already used or has expired.");
      }
      await userRepository.update(
        user.id,
        {
          name,
          passwordHash,
          passwordChangedAt: new Date(),
          status: "ACTIVE",
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
        user.id,
        tx,
      );
      await membershipRepository.activateInvited(user.id, tx);
      await recordAuditEvent(
        {
          action: "user.invitation_accepted",
          entityType: "User",
          entityId: user.id,
          actorId: user.id,
          companyId: consumed.companyId,
          ...info,
        },
        tx,
      );
      return { id: user.id, name, email: user.email };
    });
  },
};
