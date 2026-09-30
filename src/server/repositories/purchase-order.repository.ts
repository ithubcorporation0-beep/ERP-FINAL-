import { z } from "zod";
import { Prisma, type PurchaseOrderStatus } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { PurchaseOrderListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const listSelect = {
  id: true,
  number: true,
  status: true,
  orderDate: true,
  expectedDate: true,
  total: true,
  currency: true,
  createdAt: true,
  supplier: { select: { id: true, number: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  _count: { select: { items: true } },
} as const;

const detailSelect = {
  ...listSelect,
  supplierId: true,
  warehouseId: true,
  requestId: true,
  notes: true,
  orderedAt: true,
  cancelledAt: true,
  cancelReason: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  request: { select: { id: true, number: true } },
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      position: true,
      product: { select: { id: true, number: true, sku: true, name: true, unit: true } },
      receiptItems: { select: { quantity: true } },
    },
    orderBy: { position: "asc" },
  },
  receipts: {
    select: {
      id: true,
      number: true,
      receivedDate: true,
      note: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      warehouse: { select: { name: true } },
      items: {
        select: { quantity: true, product: { select: { name: true, sku: true, unit: true } } },
      },
    },
    orderBy: { number: "desc" },
  },
  invoices: {
    where: { status: { not: "CANCELLED" } },
    select: { id: true, number: true, status: true, subtotal: true, total: true },
  },
} as const;

export interface PurchaseOrderLine {
  productId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  position: number;
}

export interface PurchaseOrderData {
  supplierId: string;
  warehouseId: string;
  requestId: string | null;
  orderDate: Date;
  expectedDate: Date | null;
  notes: string | null;
  total: string;
}

const lockRows = z.array(z.object({ status: z.string() }));

export const purchaseOrderRepository = {
  async list(companyId: string, query: PurchaseOrderListQuery, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("purchaseOrder", search) : undefined;
    const where: Prisma.PurchaseOrderWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(search
        ? {
            OR: [
              { supplier: { name: { contains: search, mode: "insensitive" } } },
              { notes: { contains: search, mode: "insensitive" } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.purchaseOrder.findMany({
        where,
        select: listSelect,
        orderBy: { number: "desc" },
        ...pageArgs(query),
      }),
      client.purchaseOrder.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.purchaseOrder.findFirst({ where: { id, companyId }, select: detailSelect });
  },

  /** Orders to pick from when recording a supplier invoice. */
  billable(companyId: string, supplierId: string | undefined, client: DbClient = db) {
    return client.purchaseOrder.findMany({
      where: {
        companyId,
        status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] },
        ...(supplierId ? { supplierId } : {}),
      },
      select: { id: true, number: true, total: true, supplierId: true, supplier: { select: { name: true } } },
      orderBy: { number: "desc" },
      take: 500,
    });
  },

  create(
    companyId: string,
    numbers: { number: number; currency: string },
    data: PurchaseOrderData,
    lines: readonly PurchaseOrderLine[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.purchaseOrder.create({
      data: {
        ...data,
        ...numbers,
        companyId,
        ...createdBy(actorId),
        items: { createMany: { data: [...lines] } },
      },
      select: detailSelect,
    });
  },

  /** Replaces header and lines of a draft order (checked in the UPDATE itself). */
  async replaceDraft(
    companyId: string,
    id: string,
    data: PurchaseOrderData,
    lines: readonly PurchaseOrderLine[],
    actorId: ActorId,
    client: DbClient,
  ) {
    const { count } = await client.purchaseOrder.updateMany({
      where: { id, companyId, status: "DRAFT" },
      data: { ...data, ...updatedBy(actorId) },
    });
    if (count === 0) return false;
    await client.purchaseOrderItem.deleteMany({ where: { companyId, orderId: id } });
    await client.purchaseOrderItem.createMany({
      data: lines.map((line) => ({ ...line, companyId, orderId: id })),
    });
    return true;
  },

  async setStatus(
    companyId: string,
    id: string,
    from: readonly PurchaseOrderStatus[],
    data: Prisma.PurchaseOrderUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient,
  ) {
    const { count } = await client.purchaseOrder.updateMany({
      where: { id, companyId, status: { in: [...from] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /**
   * Locks the order row until the transaction ends, so two goods receipts for the same order can't both see the
   * old received quantities and over-receive. Raw SQL, scoped by company explicitly. Returns the locked status.
   */
  async lock(companyId: string, id: string, client: DbClient): Promise<string | null> {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT status::text AS status FROM purchase_orders
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
      FOR UPDATE`);
    return lockRows.parse(rows)[0]?.status ?? null;
  },

  createReceipt(
    companyId: string,
    number: number,
    data: { orderId: string; warehouseId: string; receivedDate: Date; note: string | null },
    lines: ReadonlyArray<{ orderItemId: string; productId: string; quantity: string }>,
    actorId: ActorId,
    client: DbClient,
  ) {
    return client.goodsReceipt.create({
      data: {
        ...data,
        number,
        companyId,
        createdById: actorId,
        items: { createMany: { data: [...lines] } },
      },
      select: { id: true, number: true },
    });
  },

  listForSupplier(companyId: string, supplierId: string, client: DbClient = db) {
    return client.purchaseOrder.findMany({
      where: { companyId, supplierId },
      select: listSelect,
      orderBy: { number: "desc" },
      take: 100,
    });
  },

  /** Ordered quantities not received yet, per product (products page "on order"). */
  async openQuantities(companyId: string, client: DbClient = db) {
    return client.purchaseOrderItem.findMany({
      where: { companyId, order: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } } },
      select: { productId: true, quantity: true, receiptItems: { select: { quantity: true } } },
    });
  },
};
