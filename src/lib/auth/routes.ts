/** Name of the HTTP-only session cookie (shared by the proxy and the session module). */
export const SESSION_COOKIE = "erp_session";

/** Pages reachable without signing in. Everything else under the app requires a session. */
export const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/accept-invite",
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Optimistic check for the proxy: signed-out visitors of protected pages go to /login?next=… .
 * Only checks that a session cookie exists — the real validation happens on the server for every page,
 * action and API route. Returns the login URL to redirect to, or null to continue.
 */
export function loginRedirectFor(pathname: string, search: string, hasSessionCookie: boolean): string | null {
  if (hasSessionCookie || isPublicPath(pathname)) return null;
  const next = `${pathname}${search}`;
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}
