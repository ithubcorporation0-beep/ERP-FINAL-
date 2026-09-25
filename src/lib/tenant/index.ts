import { getCurrentUser } from "@/lib/auth/session";
import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { hasPermission, type Action, type Module } from "@/lib/permissions";
import { membershipRepository } from "@/server/repositories/membership.repository";

/** Who is acting, in which company, with which permissions. Passed to every service call. */
export interface TenantContext {
  userId: string;
  companyId: string;
  roleId: string;
  permissions: string[];
}

/**
 * Resolves the signed-in user's company and permissions (server-side only).
 * Every service call must receive this so queries are always scoped by `companyId`.
 */
export async function requireTenant(companyId?: string): Promise<TenantContext> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();

  const access = await membershipRepository.findAccess(user.id, companyId);
  if (!access) throw new ForbiddenError("You don't have access to this company.");

  return {
    userId: user.id,
    companyId: access.companyId,
    roleId: access.roleId,
    permissions: access.permissions,
  };
}

/** `requireTenant` plus a permission check. Throws ForbiddenError when the permission is missing. */
export async function requirePermission(module: Module, action: Action, companyId?: string) {
  const ctx = await requireTenant(companyId);
  if (!hasPermission(ctx.permissions, `${module}:${action}`)) {
    throw new ForbiddenError(`You don't have permission to ${action} ${module}.`);
  }
  return ctx;
}
