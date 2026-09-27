import type { Prisma, QuotationStatus } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { OPEN_QUOTATION_STATUSES } from "@/config/sales";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { QuotationListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";
import { documentCustomerSelect, itemSelect, type DocumentTotalsData, type PricedItem } from "./sales-items";

export interface QuotationData extends DocumentTotalsData {
  customerId: string;
  leadId: string | null;
  quoteDate: Date;
  expiryDate: Date;
  notes: string | null;
  terms: string | null;
}

const listSelect = {
  id: true,
  number: true,
  orderNumber: true,
  status: true,
  quoteDate: true,
  expiryDate: true,
  currency: true,
  total: true,
  confirmedAt: true,
  customer: { select: { id: true, name: true, companyName: true } },
} as const;

const detailSelect = {
  ...listSelect,
  customerId: true,
  leadId: true,
  subtotal: true,
  discountTotal: true,
  taxTotal: true,
  notes: true,
  terms: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: documentCustomerSelect },
  lead: { select: { id: true, number: true, name: true } },
  items: { select: itemSelect, orderBy: { position: "asc" } },
  invoices: { where: { deletedAt: null }, select: { id: true, code: true, status: true } },
  createdBy: { select: { name: true } },
} as const;

function listWhere(companyId: string, query: QuotationListQuery, today: string): Prisma.QuotationWhereInput {
  const todayDate = dateOnlyToDate(today);
  const open = [...OPEN_QUOTATION_STATUSES];
  const status: Prisma.QuotationWhereInput =
    query.status === "EXPIRED"
      ? { status: { in: open }, expiryDate: { lt: todayDate } }
      : query.status && open.includes(query.status)
        ? { status: query.status, expiryDate: { gte: todayDate } }
        : query.status
          ? { status: query.status }
          : {};
  const search = query.search?.trim();
  const number = search ? parseRecordNumber("quotation", search) : undefined;
  const orderNumber = search ? parseRecordNumber("order", search) : undefined;
  return {
    companyId,
    deletedAt: null,
    ...status,
    ...(query.orders ? { orderNumber: { not: null } } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(search
      ? {
          OR: [
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { customer: { companyName: { contains: search, mode: "insensitive" } } },
            ...(number === undefined ? [] : [{ number }]),
            ...(orderNumber === undefined ? [] : [{ orderNumber }]),
          ],
        }
      : {}),
  };
}

function itemRows(companyId: string, items: readonly PricedItem[]) {
  return items.map((item) => ({ ...item, companyId }));
}

export const quotationRepository = {
  async list(companyId: string, query: QuotationListQuery, today: string, client: DbClient = db) {
    const where = listWhere(companyId, query, today);
    const [items, total] = await Promise.all([
      client.quotation.findMany({
        where,
        select: listSelect,
        orderBy: query.orders ? [{ orderNumber: "desc" }] : [{ number: "desc" }],
        ...pageArgs(query),
      }),
      client.quotation.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.quotation.findFirst({ where: { id, companyId, deletedAt: null }, select: detailSelect });
  },

  create(
    companyId: string,
    numbers: { number: number; currency: string },
    data: QuotationData,
    items: readonly PricedItem[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.quotation.create({
      data: {
        ...data,
        ...numbers,
        companyId,
        ...createdBy(actorId),
        // Nested lines take company_id from the parent (composite foreign key).
        items: { createMany: { data: [...items] } },
      },
      select: detailSelect,
    });
  },

  /**
   * Replaces header and lines, but only while the quotation is in one of `allowed` statuses (checked in the
   * UPDATE itself, so a concurrent status change can't be overwritten). Returns false when nothing matched.
   */
  async replace(
    companyId: string,
    id: string,
    allowed: readonly QuotationStatus[],
    data: QuotationData,
    items: readonly PricedItem[],
    actorId: ActorId,
    client: DbClient,
  ) {
    const { count } = await client.quotation.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...allowed] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    if (count === 0) return false;
    await client.quotationItem.deleteMany({ where: { companyId, quotationId: id } });
    await client.quotationItem.createMany({
      data: itemRows(companyId, items).map((item) => ({ ...item, quotationId: id })),
    });
    return true;
  },

  /** Status change guarded by the current status. Returns false when the quotation wasn't in `from`. */
  async transition(
    companyId: string,
    id: string,
    from: readonly QuotationStatus[],
    data: Prisma.QuotationUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.quotation.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...from] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  softDelete(
    companyId: string,
    id: string,
    allowed: readonly QuotationStatus[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.quotation.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...allowed] } },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },
};
