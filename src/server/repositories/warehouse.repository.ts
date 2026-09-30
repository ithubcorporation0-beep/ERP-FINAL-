import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  name: true,
  address: true,
  isActive: true,
  createdAt: true,
  _count: { select: { stockMovements: true } },
} as const;

export interface WarehouseData {
  name: string;
  address: string | null;
  isActive?: boolean;
}

export const warehouseRepository = {
  list(companyId: string, client: DbClient = db) {
    return client.warehouse.findMany({ where: { companyId }, orderBy: { name: "asc" }, select });
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.warehouse.findFirst({ where: { id, companyId }, select });
  },

  findByName(companyId: string, name: string, client: DbClient = db) {
    return client.warehouse.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
  },

  create(companyId: string, data: WarehouseData, actorId: ActorId, client: DbClient = db) {
    return client.warehouse.create({ data: { ...data, companyId, ...createdBy(actorId) }, select });
  },

  async update(companyId: string, id: string, data: WarehouseData, actorId: ActorId, client: DbClient = db) {
    const { count } = await client.warehouse.updateMany({
      where: { id, companyId },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Deletes a warehouse with no stock history, products or orders; returns how many were deleted. */
  delete(companyId: string, id: string, client: DbClient = db) {
    return client.warehouse.deleteMany({
      where: {
        id,
        companyId,
        stockMovements: { none: {} },
        products: { none: {} },
        purchaseOrders: { none: {} },
      },
    });
  },
};
