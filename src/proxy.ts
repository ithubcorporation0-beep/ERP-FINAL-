import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, loginRedirectFor } from "@/lib/auth/routes";

/** First, cheap gate: redirects visitors without a session cookie to the login page. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = loginRedirectFor(pathname, search, request.cookies.has(SESSION_COOKIE));
  return target ? NextResponse.redirect(new URL(target, request.url)) : NextResponse.next();
}

export const config = {
  // Pages only: API routes answer 401 JSON themselves; static assets are always public.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
