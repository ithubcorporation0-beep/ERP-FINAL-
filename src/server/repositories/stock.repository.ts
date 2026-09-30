import type { Prisma, StockMovementType } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { StockMovementListQuery } from "@/lib/validation";
import { pageArgs, toPage, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  number: true,
  productId: true,
  warehouseId: true,
  type: true,
  quantity: true,
  unitCost: true,
  movementDate: true,
  reference: true,
  note: true,
  transferId: true,
  goodsReceiptId: true,
  createdAt: true,
  product: { select: { id: true, number: true, sku: true, name: true, unit: true } },
  warehouse: { select: { id: true, name: true } },
  goodsReceipt: { select: { id: true, number: true, orderId: true } },
  createdBy: { select: { name: true } },
} as const;

export interface StockMovementData {
  productId: string;
  warehouseId: string;
  type: StockMovementType;
  /** Signed decimal string. */
  quantity: string;
  unitCost: string | null;
  movementDate: Date;
  reference: string | null;
  note: string | null;
  transferId?: string | null;
  goodsReceiptId?: string | null;
}

/**
 * The inventory ledger. Rows are only ever inserted (the database refuses updates and deletes); stock is always
 * the SUM of the quantities — there is no stored "current stock" to drift from the history.
 */
export const stockRepository = {
  create(
    companyId: string,
    number: number,
    data: StockMovementData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.stockMovement.create({
      data: { ...data, number, companyId, createdById: actorId },
      select,
    });
  },

  /** Stock of one product in one warehouse (sum of its movements; "0" when there are none). */
  async onHand(companyId: string, productId: string, warehouseId: string, client: DbClient = db) {
    const result = await client.stockMovement.aggregate({
      where: { companyId, productId, warehouseId },
      _sum: { quantity: true },
    });
    return result._sum.quantity?.toString() ?? "0";
  },

  /** Stock per product and warehouse, for the given products (all products when `productIds` is omitted). */
  async levels(companyId: string, productIds?: readonly string[], client: DbClient = db) {
    const rows = await client.stockMovement.groupBy({
      by: ["productId", "warehouseId"],
      where: { companyId, ...(productIds ? { productId: { in: [...productIds] } } : {}) },
      _sum: { quantity: true },
    });
    return rows.map((row) => ({
      productId: row.productId,
      warehouseId: row.warehouseId,
      quantity: row._sum.quantity?.toString() ?? "0",
    }));
  },

  /** Stock per product across all warehouses (optionally only in one warehouse). */
  async totals(
    companyId: string,
    filter: { productIds?: readonly string[]; warehouseId?: string } = {},
    client: DbClient = db,
  ) {
    const rows = await client.stockMovement.groupBy({
      by: ["productId"],
      where: {
        companyId,
        ...(filter.productIds ? { productId: { in: [...filter.productIds] } } : {}),
        ...(filter.warehouseId ? { warehouseId: filter.warehouseId } : {}),
      },
      _sum: { quantity: true },
    });
    return new Map(rows.map((row) => [row.productId, row._sum.quantity?.toString() ?? "0"]));
  },

  /** Inventory history, newest first. */
  async list(companyId: string, query: StockMovementListQuery, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("stock", search) : undefined;
    const where: Prisma.StockMovementWhereInput = {
      companyId,
      ...(search
        ? {
            OR: [
              { product: { name: { contains: search, mode: "insensitive" } } },
              { product: { sku: { contains: search, mode: "insensitive" } } },
              { reference: { contains: search, mode: "insensitive" } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };
    const [items, total] = await Promise.all([
      client.stockMovement.findMany({
        where,
        select,
        orderBy: [{ movementDate: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.stockMovement.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.stockMovement.findFirst({ where: { id, companyId }, select });
  },

  countForProduct(companyId: string, productId: string, client: DbClient = db) {
    return client.stockMovement.count({ where: { companyId, productId } });
  },
};
