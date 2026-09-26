import type { PermissionDefinition } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

export const permissionRepository = {
  /**
   * Makes the table match the catalogue: inserts new keys, refreshes descriptions and deletes keys that no
   * longer exist (their role grants are removed with them by the foreign key cascade).
   */
  async syncCatalog(catalog: readonly PermissionDefinition[], client: DbClient = db) {
    for (const permission of catalog) {
      await client.permission.upsert({
        where: { key: permission.key },
        create: permission,
        update: { module: permission.module, action: permission.action, description: permission.description },
      });
    }
    const { count } = await client.permission.deleteMany({
      where: { key: { notIn: catalog.map((permission) => permission.key) } },
    });
    return { removed: count };
  },

  findByKeys(keys: readonly string[], client: DbClient = db) {
    return client.permission.findMany({ where: { key: { in: [...keys] } }, select: { id: true, key: true } });
  },
};
