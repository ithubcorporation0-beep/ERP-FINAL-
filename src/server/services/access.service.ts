import { DEFAULT_ROLES, PERMISSION_CATALOG, expandPermissions } from "@/lib/permissions";
import type { ActorId, DbClient } from "@/server/repositories/helpers";
import { permissionRepository } from "@/server/repositories/permission.repository";
import { roleRepository } from "@/server/repositories/role.repository";

export const accessService = {
  /** Makes the `permissions` table match the catalogue in code. Safe to run repeatedly. */
  syncPermissionCatalog(client?: DbClient) {
    return permissionRepository.upsertCatalog(PERMISSION_CATALOG, client);
  },

  /**
   * Creates the built-in roles for a company (or refreshes their permissions if they exist).
   * Returns role ids by name. Requires the permission catalogue to be synced first.
   */
  async ensureDefaultRoles(companyId: string, actorId: ActorId, client?: DbClient) {
    const roleIds: Record<string, string> = {};
    for (const [name, definition] of Object.entries(DEFAULT_ROLES)) {
      const role =
        (await roleRepository.findByName(companyId, name, client)) ??
        (await roleRepository.create(
          companyId,
          { name, description: definition.description, isSystem: true },
          actorId,
          client,
        ));
      const keys = expandPermissions(definition.permissions);
      const permissions = await permissionRepository.findByKeys(keys, client);
      if (permissions.length !== keys.length) {
        throw new Error(
          `Permission catalogue is not synced (role ${name}: ${permissions.length}/${keys.length}).`,
        );
      }
      await roleRepository.setPermissions(
        companyId,
        role.id,
        permissions.map((permission) => permission.id),
        actorId,
        client,
      );
      roleIds[name] = role.id;
    }
    return roleIds;
  },
};
