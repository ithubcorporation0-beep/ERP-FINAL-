import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

export interface CompanyAccess {
  companyId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

export const membershipRepository = {
  /**
   * The user's access to a company: active membership in an active, non-deleted company, with the
   * role's permission keys. Without `companyId`, returns the user's first (oldest) company.
   */
  async findAccess(userId: string, companyId?: string, client: DbClient = db): Promise<CompanyAccess | null> {
    const membership = await client.membership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        ...(companyId ? { companyId } : {}),
        company: { status: "ACTIVE", deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        companyId: true,
        role: {
          select: {
            id: true,
            name: true,
            rolePermissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    if (!membership) return null;
    return {
      companyId: membership.companyId,
      roleId: membership.role.id,
      roleName: membership.role.name,
      permissions: membership.role.rolePermissions.map((row) => row.permission.key),
    };
  },

  upsert(companyId: string, userId: string, roleId: string, actorId: ActorId, client: DbClient = db) {
    return client.membership.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { companyId, userId, roleId, ...createdBy(actorId) },
      update: { roleId, ...updatedBy(actorId) },
      select: { id: true },
    });
  },
};
