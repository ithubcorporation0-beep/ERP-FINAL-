import { DEFAULT_ROLES, PERMISSION_CATALOG, expandPermissions } from "@/lib/permissions";
import { companyRepository } from "@/server/repositories/company.repository";
import type { ActorId, DbClient } from "@/server/repositories/helpers";
import { permissionRepository } from "@/server/repositories/permission.repository";
import { roleRepository } from "@/server/repositories/role.repository";

export const accessService = {
  /** Makes the `permissions` table match the catalogue in code. Safe to run repeatedly. */
  syncPermissionCatalog(client?: DbClient) {
    return permissionRepository.syncCatalog(PERMISSION_CATALOG, client);
  },

  /**
   * Creates the built-in roles for a company, or resets their permissions to the definitions in code
   * (built-in roles are not editable in the UI). Returns role ids by name.
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
      await roleRepository.update(
        companyId,
        role.id,
        { description: definition.description },
        actorId,
        client,
      );
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

  /** Refreshes built-in roles in every company (run by the seed after permission changes). */
  async syncAllCompanies(client?: DbClient) {
    const companies = await companyRepository.listIds(client);
    for (const company of companies) await this.ensureDefaultRoles(company.id, null, client);
    return companies.length;
  },
};
