import { redirect } from "next/navigation";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import type { PermissionKey } from "@/lib/permissions";
import { can, requireTenant, type TenantContext } from "@/lib/tenant";

/**
 * Server-side guard for pages (server components). Call it at the top of every protected page:
 *
 * ```tsx
 * const ctx = await authorizePage("users:view");
 * if (!ctx) return <AccessDenied />;
 * ```
 *
 * - signed out / session expired → redirects to /login
 * - no access to the company, or missing permission → returns null (render <AccessDenied />)
 * - otherwise → the TenantContext for loading data
 *
 * This is the real protection. Hiding links in the menu is only a convenience.
 */
export async function authorizePage(permission?: PermissionKey): Promise<TenantContext | null> {
  let ctx: TenantContext;
  try {
    ctx = await requireTenant();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) return null;
    throw error;
  }
  if (permission && !can(ctx, permission)) return null;
  return ctx;
}
