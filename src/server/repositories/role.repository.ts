import { db } from "@/lib/db";
import { createdBy, type ActorId, type DbClient } from "./helpers";

export const roleRepository = {
  findByName(companyId: string, name: string, client: DbClient = db) {
    return client.role.findUnique({
      where: { companyId_name: { companyId, name } },
      select: { id: true, name: true },
    });
  },

  create(
    companyId: string,
    data: { name: string; description?: string; isSystem?: boolean },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.role.create({
      data: { ...data, companyId, ...createdBy(actorId) },
      select: { id: true, name: true },
    });
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

  listPermissionKeys(companyId: string, roleId: string, client: DbClient = db) {
    return client.rolePermission
      .findMany({ where: { companyId, roleId }, select: { permission: { select: { key: true } } } })
      .then((rows) => rows.map((row) => row.permission.key));
  },
};
