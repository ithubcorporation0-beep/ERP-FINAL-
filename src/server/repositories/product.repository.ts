import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { ProductListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  number: true,
  sku: true,
  name: true,
  categoryId: true,
  brand: true,
  unit: true,
  purchasePrice: true,
  sellingPrice: true,
  minimumStock: true,
  supplierId: true,
  warehouseId: true,
  description: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, number: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
} as const;

export type ProductData = Pick<
  Prisma.ProductUncheckedCreateInput,
  | "sku"
  | "name"
  | "categoryId"
  | "brand"
  | "unit"
  | "purchasePrice"
  | "sellingPrice"
  | "minimumStock"
  | "supplierId"
  | "warehouseId"
  | "description"
  | "isActive"
>;

const lockRows = z.array(z.object({ id: z.string() }));

export const productRepository = {
  /**
   * Products page. `ids` narrows the list to products computed elsewhere (e.g. the low-stock set, which depends on
   * stock sums), keeping the paging in the database.
   */
  async list(
    companyId: string,
    query: ProductListQuery & { ids?: readonly string[] },
    client: DbClient = db,
  ) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("product", search) : undefined;
    const where: Prisma.ProductWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.inactive ? {} : { isActive: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.ids ? { id: { in: [...query.ids] } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
              { brand: { contains: search, mode: "insensitive" } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.product.findMany({
        where,
        select,
        orderBy: [{ name: "asc" }, { number: "asc" }],
        ...pageArgs(query),
      }),
      client.product.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.product.findFirst({ where: { id, companyId, deletedAt: null }, select });
  },

  findBySku(companyId: string, sku: string, client: DbClient = db) {
    return client.product.findFirst({
      where: { companyId, sku: { equals: sku, mode: "insensitive" } },
      select: { id: true, deletedAt: true },
    });
  },

  /** Active products to choose from (stock forms, purchase lines). */
  options(companyId: string, client: DbClient = db) {
    return client.product.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: {
        id: true,
        number: true,
        sku: true,
        name: true,
        unit: true,
        purchasePrice: true,
        supplierId: true,
        warehouseId: true,
      },
      orderBy: { name: "asc" },
      take: 2000,
    });
  },

  /** Minimum stock of every active product (low-stock detection). */
  thresholds(companyId: string, client: DbClient = db) {
    return client.product.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: { id: true, minimumStock: true },
    });
  },

  /** Products (active or not) by id — names for movement lists, receipts, reports. */
  findMany(companyId: string, ids: readonly string[], client: DbClient = db) {
    return client.product.findMany({
      where: { companyId, id: { in: [...ids] }, deletedAt: null },
      select,
    });
  },

  create(companyId: string, number: number, data: ProductData, actorId: ActorId, client: DbClient = db) {
    return client.product.create({ data: { ...data, number, companyId, ...createdBy(actorId) }, select });
  },

  async update(companyId: string, id: string, data: ProductData, actorId: ActorId, client: DbClient = db) {
    const { count } = await client.product.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  softDelete(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.product.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  /**
   * Locks the product row until the transaction ends (SELECT … FOR UPDATE), so two stock-outs of the same product
   * can't both see the old stock and oversell it. Raw SQL, scoped by company explicitly.
   */
  async lock(companyId: string, id: string, client: DbClient): Promise<boolean> {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT id::text AS id FROM products
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid AND deleted_at IS NULL
      FOR UPDATE`);
    return lockRows.parse(rows).length === 1;
  },

  listForSupplier(companyId: string, supplierId: string, client: DbClient = db) {
    return client.product.findMany({
      where: { companyId, supplierId, deletedAt: null },
      select,
      orderBy: { name: "asc" },
      take: 200,
    });
  },
};
