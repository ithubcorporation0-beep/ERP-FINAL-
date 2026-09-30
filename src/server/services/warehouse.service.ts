import "server-only";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasAnyPermission } from "@/lib/permissions";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { WarehouseInput } from "@/lib/validation";
import { warehouseRepository } from "@/server/repositories/warehouse.repository";
import { writeAuditLog } from "./audit.service";

/**
 * Warehouses (stock locations): reading needs `inventory:view`, `products:view` or `purchases:view`; create / edit / delete
 * `inventory:create` / `edit` / `delete`. A warehouse with stock history can't be deleted — deactivate it.
 */
export const warehouseService = {
  async list(ctx: TenantContext) {
    if (!hasAnyPermission(ctx.permissions, ["products:view", "purchases:view"]))
      authorize(ctx, "inventory:view");
    return warehouseRepository.list(ctx.companyId);
  },

  /** Active warehouses to choose from. */
  async options(ctx: TenantContext) {
    return (await this.list(ctx)).filter((warehouse) => warehouse.isActive);
  },

  async get(ctx: TenantContext, id: string) {
    const warehouse = (await this.list(ctx)).find((candidate) => candidate.id === id);
    if (!warehouse) throw new NotFoundError("Warehouse");
    return warehouse;
  },

  /** An active warehouse of this company, or a validation error on `field`. */
  async active(ctx: TenantContext, id: string, field = "warehouseId") {
    const warehouse = await warehouseRepository.findById(ctx.companyId, id);
    if (!warehouse || !warehouse.isActive) {
      throw new ValidationError("Choose an active warehouse.", { [field]: ["Choose an active warehouse."] });
    }
    return warehouse;
  },

  async assertUniqueName(ctx: TenantContext, name: string, exceptId?: string) {
    const existing = await warehouseRepository.findByName(ctx.companyId, name);
    if (existing && existing.id !== exceptId) {
      throw new ValidationError("A warehouse with this name already exists.", { name: ["Already exists."] });
    }
  },

  async create(ctx: TenantContext, input: WarehouseInput) {
    authorize(ctx, "inventory:create");
    await this.assertUniqueName(ctx, input.name);
    return db.$transaction(async (tx) => {
      const warehouse = await warehouseRepository.create(
        ctx.companyId,
        { name: input.name, address: input.address || null },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "warehouse.create",
          entityType: "Warehouse",
          entityId: warehouse.id,
          after: { name: warehouse.name, address: warehouse.address },
        },
        tx,
      );
      return warehouse;
    });
  },

  async update(ctx: TenantContext, id: string, input: WarehouseInput) {
    authorize(ctx, "inventory:edit");
    const before = await this.get(ctx, id);
    await this.assertUniqueName(ctx, input.name, id);
    await db.$transaction(async (tx) => {
      const data = {
        name: input.name,
        address: input.address || null,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      };
      if (!(await warehouseRepository.update(ctx.companyId, id, data, ctx.userId, tx)))
        throw new NotFoundError("Warehouse");
      await writeAuditLog(
        ctx,
        {
          action: "warehouse.update",
          entityType: "Warehouse",
          entityId: id,
          before: { name: before.name, address: before.address, isActive: before.isActive },
          after: { isActive: before.isActive, ...data },
        },
        tx,
      );
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "inventory:delete");
    const warehouse = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await warehouseRepository.delete(ctx.companyId, id, tx);
      if (count === 0) {
        throw new ConflictError(
          "Warehouses with stock history, products or purchase orders can't be deleted. Deactivate it instead.",
        );
      }
      await writeAuditLog(
        ctx,
        {
          action: "warehouse.delete",
          entityType: "Warehouse",
          entityId: id,
          before: { name: warehouse.name },
        },
        tx,
      );
    });
  },
};
