import type { PermissionDefinition } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

export const permissionRepository = {
  /** Inserts new catalogue entries and refreshes descriptions of existing ones. */
  async upsertCatalog(catalog: readonly PermissionDefinition[], client: DbClient = db) {
    for (const permission of catalog) {
      await client.permission.upsert({
        where: { key: permission.key },
        create: permission,
        update: { module: permission.module, action: permission.action, description: permission.description },
      });
    }
  },

  findByKeys(keys: readonly string[], client: DbClient = db) {
    return client.permission.findMany({ where: { key: { in: [...keys] } }, select: { id: true, key: true } });
  },
};
