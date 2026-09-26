import { cookies } from "next/headers";
import { cache } from "react";
import { logger } from "@/lib/logger";
import { sessionRepository } from "@/server/repositories/session.repository";
import { SESSION_COOKIE } from "./routes";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, isSessionValid, nextSessionExpiry } from "./session-policy";
import { generateToken, hashToken } from "./tokens";

export { SESSION_COOKIE };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface CurrentSession {
  sessionId: string;
  user: SessionUser;
}

/**
 * Starts a new session (always a fresh random token — prevents session fixation) and sets the
 * HTTP-only cookie. Call only from server actions or route handlers.
 */
export async function createSession(
  userId: string,
  client: { ipAddress?: string; userAgent?: string } = {},
): Promise<void> {
  const { token, hash } = generateToken();
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_MS);
  await sessionRepository.create({
    userId,
    tokenHash: hash,
    expiresAt: new Date(now + SESSION_IDLE_MS),
    absoluteExpiresAt,
    ...client,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // The database decides validity (idle + absolute expiry); the cookie just must not outlive it.
    expires: absoluteExpiresAt,
  });
}

/**
 * The current, valid session of an ACTIVE user — or null. Cached per request, so layouts, pages and
 * actions can all call it without extra queries. Extends the idle expiry at most once an hour.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await sessionRepository.findByTokenHash(hashToken(token));
  if (!session || !isSessionValid(session) || session.user.status !== "ACTIVE") return null;

  const nextExpiry = nextSessionExpiry(session);
  if (nextExpiry) {
    // Best effort: a failed extension must not sign the user out, but it is logged.
    await sessionRepository.touch(session.id, nextExpiry).catch((error: unknown) => {
      logger.warn("Could not extend session", { error });
    });
  }

  const { id, name, email, emailVerifiedAt } = session.user;
  return { sessionId: session.id, user: { id, name, email, emailVerified: emailVerifiedAt !== null } };
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getCurrentSession())?.user ?? null;
}

/** Ends the current session. Returns the user id it belonged to (for the audit log), if any. */
export async function destroySession(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  let userId: string | null = null;
  if (token) {
    const session = await sessionRepository.findByTokenHash(hashToken(token));
    userId = session?.user.id ?? null;
    await sessionRepository.deleteByTokenHash(hashToken(token));
  }
  store.delete(SESSION_COOKIE);
  return userId;
}
