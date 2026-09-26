import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const roleSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { memberships: true } },
  rolePermissions: { select: { permission: { select: { key: true } } } },
} as const;

function shape<
  T extends { _count: { memberships: number }; rolePermissions: Array<{ permission: { key: string } }> },
>(role: T) {
  const { _count, rolePermissions, ...rest } = role;
  return {
    ...rest,
    memberCount: _count.memberships,
    permissions: rolePermissions.map((row) => row.permission.key),
  };
}

export const roleRepository = {
  async list(companyId: string, client: DbClient = db) {
    const roles = await client.role.findMany({
      where: { companyId },
      select: roleSelect,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return roles.map(shape);
  },

  async findById(companyId: string, id: string, client: DbClient = db) {
    const role = await client.role.findFirst({ where: { id, companyId }, select: roleSelect });
    return role ? shape(role) : null;
  },

  findByName(companyId: string, name: string, client: DbClient = db) {
    return client.role.findUnique({
      where: { companyId_name: { companyId, name } },
      select: { id: true, name: true },
    });
  },

  create(
    companyId: string,
    data: { name: string; description?: string | null; isSystem?: boolean },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.role.create({
      data: { ...data, companyId, ...createdBy(actorId) },
      select: { id: true, name: true },
    });
  },

  update(
    companyId: string,
    id: string,
    data: { name?: string; description?: string | null },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.role.updateMany({ where: { id, companyId }, data: { ...data, ...updatedBy(actorId) } });
  },

  delete(companyId: string, id: string, client: DbClient = db) {
    return client.role.deleteMany({ where: { id, companyId } });
  },

  /** Replaces the role's permissions with exactly `permissionIds`. */
  async setPermissions(
    companyId: string,
    roleId: string,
    permissionIds: readonly string[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    await client.rolePermission.deleteMany({ where: { companyId, roleId } });
    await client.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ companyId, roleId, permissionId, createdById: actorId })),
    });
  },
};
