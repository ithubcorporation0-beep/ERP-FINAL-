import type { Prisma, PurchaseRequestStatus } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { PurchaseRequestListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const listSelect = {
  id: true,
  number: true,
  status: true,
  reason: true,
  neededBy: true,
  requestedById: true,
  createdAt: true,
  requestedBy: { select: { id: true, name: true } },
  supplier: { select: { id: true, number: true, name: true } },
  _count: { select: { items: true } },
} as const;

const detailSelect = {
  ...listSelect,
  supplierId: true,
  decisionNote: true,
  decidedAt: true,
  decidedBy: { select: { name: true } },
  items: {
    select: {
      id: true,
      productId: true,
      quantity: true,
      estimatedUnitPrice: true,
      position: true,
      product: { select: { id: true, number: true, sku: true, name: true, unit: true, purchasePrice: true } },
    },
    orderBy: { position: "asc" },
  },
  purchaseOrder: { select: { id: true, number: true, status: true } },
} as const;

export interface PurchaseRequestLine {
  productId: string;
  quantity: string;
  estimatedUnitPrice: string | null;
  position: number;
}

export const purchaseRequestRepository = {
  async list(
    companyId: string,
    query: PurchaseRequestListQuery & { requestedById?: string },
    client: DbClient = db,
  ) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("purchaseRequest", search) : undefined;
    const where: Prisma.PurchaseRequestWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.requestedById ? { requestedById: query.requestedById } : {}),
      ...(search
        ? {
            OR: [
              { reason: { contains: search, mode: "insensitive" } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.purchaseRequest.findMany({
        where,
        select: listSelect,
        orderBy: { number: "desc" },
        ...pageArgs(query),
      }),
      client.purchaseRequest.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.purchaseRequest.findFirst({ where: { id, companyId }, select: detailSelect });
  },

  create(
    companyId: string,
    number: number,
    data: {
      supplierId: string | null;
      neededBy: string | null;
      reason: string;
      requestedById: string | null;
    },
    lines: readonly PurchaseRequestLine[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.purchaseRequest.create({
      data: {
        number,
        companyId,
        supplierId: data.supplierId,
        neededBy: data.neededBy ? dateOnlyToDate(data.neededBy) : null,
        reason: data.reason,
        requestedById: data.requestedById,
        ...createdBy(actorId),
        // Nested lines take company_id from the parent (composite foreign key).
        items: { createMany: { data: [...lines] } },
      },
      select: detailSelect,
    });
  },

  /** Changes the status only from `from` (a concurrent decision can't be overwritten). */
  async setStatus(
    companyId: string,
    id: string,
    from: readonly PurchaseRequestStatus[],
    data: {
      status: PurchaseRequestStatus;
      decisionNote?: string | null;
      decidedById?: string | null;
      decidedAt?: Date | null;
    },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.purchaseRequest.updateMany({
      where: { id, companyId, status: { in: [...from] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  countPending(companyId: string, client: DbClient = db) {
    return client.purchaseRequest.count({ where: { companyId, status: "PENDING" } });
  },
};
