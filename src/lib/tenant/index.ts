import { cache } from "react";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { PERMISSION_KEYS, hasPermission, isPermissionKey, type PermissionKey } from "@/lib/permissions";
import { membershipRepository } from "@/server/repositories/membership.repository";

/** Who is acting, in which company, with which permissions. Passed to every service call. */
export interface TenantContext {
  userId: string;
  companyId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

/** The signed-in user (no company needed — e.g. the profile page). Throws UnauthenticatedError. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

const resolveTenant = cache(async (companyId: string | undefined): Promise<TenantContext> => {
  const user = await requireUser();
  const access = await membershipRepository.findAccess(user.id, companyId);
  if (!access) throw new ForbiddenError("You don't have access to this company.");
  return {
    userId: user.id,
    companyId: access.companyId,
    roleId: access.roleId,
    roleName: access.roleName,
    permissions: access.permissions,
  };
});

/**
 * Resolves the signed-in user's company and permissions (server-side only, cached per request).
 * The company always comes from the user's active membership — never from the request.
 */
export function requireTenant(companyId?: string): Promise<TenantContext> {
  return resolveTenant(companyId);
}

/** `requireTenant` + a permission check. Use at the top of every route handler and server action. */
export async function requirePermission(
  permission: PermissionKey,
  companyId?: string,
): Promise<TenantContext> {
  const ctx = await requireTenant(companyId);
  authorize(ctx, permission);
  return ctx;
}

/** True when the context holds the permission. For conditional rendering and branching. */
export function can(ctx: Pick<TenantContext, "permissions">, permission: PermissionKey): boolean {
  return hasPermission(ctx.permissions, permission);
}

/** Throws ForbiddenError unless the context holds the permission. Services call this too (defense in depth). */
export function authorize(ctx: Pick<TenantContext, "permissions">, permission: PermissionKey): void {
  if (!can(ctx, permission)) throw new ForbiddenError("You don't have permission to do that.");
}

/**
 * Privilege-escalation guard: an actor may only grant (to a role) or assign (via a role) permissions they
 * hold themselves. A Super Admin holds everything, so only they can create or assign Super Admins.
 */
export function assertCanGrant(
  ctx: Pick<TenantContext, "permissions">,
  permissions: readonly string[],
): void {
  const missing = permissions.filter((permission) => !isPermissionKey(permission) || !can(ctx, permission));
  if (missing.length > 0) {
    throw new ForbiddenError("You can't grant permissions you don't have yourself.", { missing });
  }
}

/** Every concrete permission the context holds — the most this user can grant to a role. */
export function grantablePermissions(ctx: Pick<TenantContext, "permissions">): PermissionKey[] {
  return PERMISSION_KEYS.filter((key) => can(ctx, key));
}
