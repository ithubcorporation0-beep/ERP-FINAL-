import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { isPermissionKey } from "@/lib/permissions";
import { assertCanGrant, authorize, type TenantContext } from "@/lib/tenant";
import type { RoleInput } from "@/lib/validation";
import type { DbClient } from "@/server/repositories/helpers";
import { permissionRepository } from "@/server/repositories/permission.repository";
import { roleRepository } from "@/server/repositories/role.repository";
import { writeAuditLog } from "./audit.service";

function uniqueKeys(keys: readonly string[]): string[] {
  const unknown = keys.filter((key) => !isPermissionKey(key));
  if (unknown.length > 0) throw new ValidationError("Unknown permissions.", { permissions: unknown });
  return [...new Set(keys)].sort();
}

async function permissionIds(keys: readonly string[], client: DbClient) {
  const rows = await permissionRepository.findByKeys(keys, client);
  if (rows.length !== keys.length)
    throw new Error("Permission catalogue is not synced — run `npm run db:seed`.");
  return rows.map((row) => row.id);
}

async function getCustomRole(ctx: TenantContext, id: string, client?: DbClient) {
  const role = await roleRepository.findById(ctx.companyId, id, client);
  if (!role) throw new NotFoundError("Role");
  if (role.isSystem) {
    throw new ForbiddenError("Built-in roles can't be changed. Duplicate the role to customize it.");
  }
  return role;
}

/** Company roles. Built-in roles are read-only; custom roles can only contain permissions the editor holds. */
export const roleService = {
  async list(ctx: TenantContext) {
    authorize(ctx, "roles:view");
    return roleRepository.list(ctx.companyId);
  },

  /** Roles the current user may assign to others (subset of their own permissions). */
  async assignable(ctx: TenantContext) {
    authorize(ctx, "users:manage");
    const roles = await roleRepository.list(ctx.companyId);
    return roles.filter((role) =>
      role.permissions.every((key) => isPermissionKey(key) && ctx.permissions.includes(key)),
    );
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "roles:view");
    const role = await roleRepository.findById(ctx.companyId, id);
    if (!role) throw new NotFoundError("Role");
    return role;
  },

  async create(ctx: TenantContext, input: RoleInput) {
    authorize(ctx, "roles:manage");
    const keys = uniqueKeys(input.permissions);
    assertCanGrant(ctx, keys);
    return db.$transaction(async (tx) => {
      if (await roleRepository.findByName(ctx.companyId, input.name, tx)) {
        throw new ConflictError("A role with this name already exists.", { name: ["Name already in use."] });
      }
      const role = await roleRepository.create(
        ctx.companyId,
        { name: input.name, description: input.description || null },
        ctx.userId,
        tx,
      );
      await roleRepository.setPermissions(
        ctx.companyId,
        role.id,
        await permissionIds(keys, tx),
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "role.create",
          entityType: "Role",
          entityId: role.id,
          after: { name: input.name, permissions: keys },
        },
        tx,
      );
      return role;
    });
  },

  async update(ctx: TenantContext, id: string, input: RoleInput) {
    authorize(ctx, "roles:manage");
    const keys = uniqueKeys(input.permissions);
    return db.$transaction(async (tx) => {
      const before = await getCustomRole(ctx, id, tx);
      // You may only edit a role you could have created: its old and new permissions must both be yours.
      assertCanGrant(ctx, [...before.permissions, ...keys]);
      const clash = await roleRepository.findByName(ctx.companyId, input.name, tx);
      if (clash && clash.id !== id) {
        throw new ConflictError("A role with this name already exists.", { name: ["Name already in use."] });
      }
      await roleRepository.update(
        ctx.companyId,
        id,
        { name: input.name, description: input.description || null },
        ctx.userId,
        tx,
      );
      await roleRepository.setPermissions(ctx.companyId, id, await permissionIds(keys, tx), ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "role.update",
          entityType: "Role",
          entityId: id,
          before: { name: before.name, permissions: before.permissions },
          after: { name: input.name, permissions: keys },
        },
        tx,
      );
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "roles:manage");
    return db.$transaction(async (tx) => {
      const role = await getCustomRole(ctx, id, tx);
      assertCanGrant(ctx, role.permissions);
      if (role.memberCount > 0) {
        throw new ConflictError(
          `This role is assigned to ${role.memberCount} member(s). Give them another role first.`,
        );
      }
      await roleRepository.delete(ctx.companyId, id, tx);
      await writeAuditLog(
        ctx,
        {
          action: "role.delete",
          entityType: "Role",
          entityId: id,
          before: { name: role.name, permissions: role.permissions },
        },
        tx,
      );
    });
  },
};
