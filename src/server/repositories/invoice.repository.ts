import { z } from "zod";
import { Prisma, type InvoiceStatus } from "@/generated/prisma/client";
import { OPEN_INVOICE_STATUSES } from "@/config/sales";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { InvoiceListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";
import { documentCustomerSelect, itemSelect, type DocumentTotalsData, type PricedItem } from "./sales-items";

export interface InvoiceData extends DocumentTotalsData {
  customerId: string;
  invoiceDate: Date;
  dueDate: Date;
  notes: string | null;
  terms: string | null;
}

const listSelect = {
  id: true,
  code: true,
  status: true,
  invoiceDate: true,
  dueDate: true,
  currency: true,
  total: true,
  amountPaid: true,
  customer: { select: { id: true, name: true, companyName: true } },
} as const;

const detailSelect = {
  ...listSelect,
  number: true,
  customerId: true,
  quotationId: true,
  subtotal: true,
  discountTotal: true,
  taxTotal: true,
  notes: true,
  terms: true,
  sentAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: documentCustomerSelect },
  quotation: { select: { id: true, number: true, orderNumber: true } },
  items: { select: itemSelect, orderBy: { position: "asc" } },
  createdBy: { select: { name: true } },
} as const;

const monthlyRows = z.array(z.object({ month: z.string(), total: z.string() }));
const lockRows = z.array(z.object({ id: z.string() }));

/** Invoices that count as issued revenue: not drafts, not cancelled. */
const ISSUED: InvoiceStatus[] = ["SENT", "PARTIALLY_PAID", "PAID"];

function listWhere(companyId: string, query: InvoiceListQuery, today: string): Prisma.InvoiceWhereInput {
  const todayDate = dateOnlyToDate(today);
  const open = [...OPEN_INVOICE_STATUSES];
  const status: Prisma.InvoiceWhereInput =
    query.status === "OVERDUE"
      ? { status: { in: open }, dueDate: { lt: todayDate } }
      : query.status && open.includes(query.status)
        ? { status: query.status, dueDate: { gte: todayDate } }
        : query.status
          ? { status: query.status }
          : {};
  const search = query.search?.trim();
  return {
    companyId,
    deletedAt: null,
    ...status,
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { customer: { name: { contains: search, mode: "insensitive" } } },
            { customer: { companyName: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

function itemRows(companyId: string, items: readonly PricedItem[]) {
  return items.map((item) => ({ ...item, companyId }));
}

export const invoiceRepository = {
  async list(companyId: string, query: InvoiceListQuery, today: string, client: DbClient = db) {
    const where = listWhere(companyId, query, today);
    const [items, total] = await Promise.all([
      client.invoice.findMany({
        where,
        select: listSelect,
        orderBy: [{ number: "desc" }],
        ...pageArgs(query),
      }),
      client.invoice.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.invoice.findFirst({ where: { id, companyId, deletedAt: null }, select: detailSelect });
  },

  /** Invoices that can receive a payment (for the payment form's picker). */
  listPayable(companyId: string, customerId: string | undefined, client: DbClient = db) {
    return client.invoice.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: [...OPEN_INVOICE_STATUSES] },
        ...(customerId ? { customerId } : {}),
      },
      select: listSelect,
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
      take: 200,
    });
  },

  create(
    companyId: string,
    numbers: { number: number; code: string; currency: string; quotationId?: string | null },
    data: InvoiceData,
    items: readonly PricedItem[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.invoice.create({
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

  /** Replaces header and lines while the invoice is a draft (checked in the UPDATE). */
  async replaceDraft(
    companyId: string,
    id: string,
    data: InvoiceData,
    items: readonly PricedItem[],
    actorId: ActorId,
    client: DbClient,
  ) {
    const { count } = await client.invoice.updateMany({
      where: { id, companyId, deletedAt: null, status: "DRAFT" },
      data: { ...data, ...updatedBy(actorId) },
    });
    if (count === 0) return false;
    await client.invoiceItem.deleteMany({ where: { companyId, invoiceId: id } });
    await client.invoiceItem.createMany({
      data: itemRows(companyId, items).map((item) => ({ ...item, invoiceId: id })),
    });
    return true;
  },

  async transition(
    companyId: string,
    id: string,
    from: readonly InvoiceStatus[],
    data: Prisma.InvoiceUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.invoice.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...from] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  softDeleteDraft(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.invoice.updateMany({
      where: { id, companyId, deletedAt: null, status: "DRAFT" },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  /**
   * Locks the invoice row until the transaction ends (SELECT … FOR UPDATE), so two payments recorded at the same
   * time can't both see the old balance and overpay. Raw SQL, scoped by company explicitly.
   */
  async lock(companyId: string, id: string, client: DbClient): Promise<boolean> {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT id::text AS id FROM invoices
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid AND deleted_at IS NULL
      FOR UPDATE`);
    return lockRows.parse(rows).length === 1;
  },

  setPaymentState(
    companyId: string,
    id: string,
    data: { amountPaid: string; status: InvoiceStatus },
    actorId: ActorId,
    client: DbClient,
  ) {
    return client.invoice.updateMany({ where: { id, companyId }, data: { ...data, ...updatedBy(actorId) } });
  },

  /** Issued, unpaid invoices due before `today` (overdue reminders). */
  listOverdue(companyId: string, today: Date, client: DbClient = db) {
    return client.invoice.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        dueDate: { lt: today },
      },
      select: {
        id: true,
        code: true,
        dueDate: true,
        total: true,
        amountPaid: true,
        currency: true,
        customer: { select: { name: true } },
      },
      take: 500,
    });
  },

  listForCustomer(companyId: string, customerId: string, client: DbClient = db) {
    return client.invoice.findMany({
      where: { companyId, customerId, deletedAt: null },
      select: listSelect,
      orderBy: [{ number: "desc" }],
      take: 100,
    });
  },

  /** Invoices that were issued at some point (for posting them to the ledger). */
  listIssuedForLedger(companyId: string, client: DbClient = db) {
    return client.invoice.findMany({
      where: { companyId, deletedAt: null, sentAt: { not: null } },
      select: {
        id: true,
        code: true,
        status: true,
        invoiceDate: true,
        cancelledAt: true,
        subtotal: true,
        discountTotal: true,
        taxTotal: true,
        total: true,
        customer: { select: { name: true } },
      },
    });
  },

  // ─── Dashboard figures ───

  /** Total of issued invoices dated `from` ≤ invoice_date < `to` (calendar dates). */
  async sumIssued(companyId: string, { from, to }: { from: string; to: string }, client: DbClient = db) {
    const result = await client.invoice.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ISSUED },
        invoiceDate: { gte: dateOnlyToDate(from), lt: dateOnlyToDate(to) },
      },
      _sum: { total: true },
    });
    return result._sum.total;
  },

  /** What customers still owe on open invoices: Σ(total − amount paid). */
  async sumOutstanding(companyId: string, client: DbClient = db) {
    const result = await client.invoice.aggregate({
      where: { companyId, deletedAt: null, status: { in: [...OPEN_INVOICE_STATUSES] } },
      _sum: { total: true, amountPaid: true },
    });
    return { total: result._sum.total, paid: result._sum.amountPaid };
  },

  /** Issued totals per calendar month ("YYYY-MM") of the invoice date. Raw SQL for GROUP BY month. */
  async sumIssuedByMonth(
    companyId: string,
    { from, to }: { from: string; to: string },
    client: DbClient = db,
  ) {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT to_char(invoice_date, 'YYYY-MM') AS month, sum(total)::text AS total
      FROM invoices
      WHERE company_id = ${companyId}::uuid
        AND deleted_at IS NULL
        AND status IN ('SENT', 'PARTIALLY_PAID', 'PAID')
        AND invoice_date >= ${from}::date
        AND invoice_date < ${to}::date
      GROUP BY 1
      ORDER BY 1`);
    return monthlyRows.parse(rows);
  },

  /** Issued totals per customer for invoices dated in the range (largest first). */
  async sumIssuedByCustomer(
    companyId: string,
    { from, to }: { from: string; to: string },
    client: DbClient = db,
  ) {
    const rows = await client.invoice.groupBy({
      by: ["customerId"],
      where: {
        companyId,
        deletedAt: null,
        status: { in: ISSUED },
        invoiceDate: { gte: dateOnlyToDate(from), lt: dateOnlyToDate(to) },
      },
      _sum: { total: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      customerId: row.customerId,
      total: row._sum.total?.toString() ?? "0",
      count: row._count._all,
    }));
  },

  /** Open invoices (sent / partially paid) with their balance inputs, oldest due first — for receivables aging. */
  listOpen(companyId: string, client: DbClient = db) {
    return client.invoice.findMany({
      where: { companyId, deletedAt: null, status: { in: [...OPEN_INVOICE_STATUSES] } },
      select: { ...listSelect, customerId: true },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    });
  },

  listRecent(companyId: string, limit: number, client: DbClient = db) {
    return client.invoice.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        code: true,
        total: true,
        currency: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });
  },
};
