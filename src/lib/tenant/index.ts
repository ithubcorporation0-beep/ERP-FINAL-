import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission, type Action, type Module } from "@/lib/permissions";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TenantContext {
  userId: string;
  organizationId: string;
  permissions: string[];
}

/**
 * Resolves the signed-in user's active organization and permissions.
 * Every service call must go through this so queries are always scoped by `organizationId`.
 */
export async function requireTenant(organizationId?: string): Promise<TenantContext> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Not authenticated");

  const membership = await db.membership.findFirst({
    where: { userId: user.id, ...(organizationId ? { organizationId } : {}) },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new HttpError(403, "No access to this organization");

  return { userId: user.id, organizationId: membership.organizationId, permissions: membership.role.permissions };
}

export async function requirePermission(module: Module, action: Action, organizationId?: string) {
  const ctx = await requireTenant(organizationId);
  if (!hasPermission(ctx.permissions, `${module}:${action}`)) {
    throw new HttpError(403, `Missing permission ${module}:${action}`);
  }
  return ctx;
}
