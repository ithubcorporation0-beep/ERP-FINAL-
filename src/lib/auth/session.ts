import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { sessionRepository } from "@/server/repositories/session.repository";

export const SESSION_COOKIE = "erp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export async function createSession(
  userId: string,
  client: { ipAddress?: string; userAgent?: string } = {},
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await sessionRepository.create({ userId, tokenHash: hashToken(token), expiresAt, ...client });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** The signed-in, active user for this request, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await sessionRepository.findByTokenHash(hashToken(token));
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  const { id, name, email } = session.user;
  return { id, name, email };
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
