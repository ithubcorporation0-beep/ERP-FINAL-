/** Session lifetime rules (pure, so they can be unit-tested). */
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // signed out after 7 days without activity
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000; // …and after 30 days no matter what
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000; // extend at most once an hour

export function isSessionValid(
  session: { expiresAt: Date; absoluteExpiresAt: Date },
  now = new Date(),
): boolean {
  return session.expiresAt > now && session.absoluteExpiresAt > now;
}

/** New idle expiry if the session should be extended now, otherwise null. */
export function nextSessionExpiry(
  session: { lastUsedAt: Date; absoluteExpiresAt: Date },
  now = new Date(),
): Date | null {
  if (now.getTime() - session.lastUsedAt.getTime() < SESSION_TOUCH_INTERVAL_MS) return null;
  return new Date(Math.min(now.getTime() + SESSION_IDLE_MS, session.absoluteExpiresAt.getTime()));
}
