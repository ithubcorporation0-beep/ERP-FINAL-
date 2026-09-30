import { z } from "zod";
import { Prisma, type SupplierInvoiceStatus } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { SupplierInvoiceListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const listSelect = {
  id: true,
  number: true,
  supplierReference: true,
  invoiceDate: true,
  dueDate: true,
  subtotal: true,
  taxAmount: true,
  total: true,
  amountPaid: true,
  currency: true,
  status: true,
  createdAt: true,
  supplier: { select: { id: true, number: true, name: true } },
  order: { select: { id: true, number: true } },
} as const;

const detailSelect = {
  ...listSelect,
  supplierId: true,
  orderId: true,
  notes: true,
  cancelledAt: true,
  cancelReason: true,
  createdBy: { select: { name: true } },
  payments: {
    select: {
      id: true,
      number: true,
      amount: true,
      method: true,
      reference: true,
      paymentDate: true,
      notes: true,
      voidedAt: true,
      voidReason: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { number: "desc" },
  },
} as const;

export interface SupplierInvoiceData {
  supplierId: string;
  orderId: string | null;
  supplierReference: string | null;
  invoiceDate: Date;
  dueDate: Date | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  notes: string | null;
}

const lockRows = z.array(z.object({ id: z.string() }));

const paymentSelect = {
  id: true,
  number: true,
  amount: true,
  method: true,
  reference: true,
  paymentDate: true,
  notes: true,
  voidedAt: true,
  voidReason: true,
  createdAt: true,
  invoiceId: true,
  supplier: { select: { id: true, number: true, name: true } },
  invoice: { select: { id: true, number: true, supplierReference: true } },
  createdBy: { select: { name: true } },
} as const;

export const supplierInvoiceRepository = {
  async list(companyId: string, query: SupplierInvoiceListQuery, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("supplierInvoice", search) : undefined;
    const where: Prisma.SupplierInvoiceWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.open ? { status: { in: ["UNPAID", "PARTIALLY_PAID"] } } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(search
        ? {
            OR: [
              { supplierReference: { contains: search, mode: "insensitive" } },
              { supplier: { name: { contains: search, mode: "insensitive" } } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.supplierInvoice.findMany({
        where,
        select: listSelect,
        orderBy: [{ invoiceDate: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.supplierInvoice.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.supplierInvoice.findFirst({ where: { id, companyId }, select: detailSelect });
  },

  create(
    companyId: string,
    numbers: { number: number; currency: string },
    data: SupplierInvoiceData,
    actorId: ActorId,
    client: DbClient,
  ) {
    return client.supplierInvoice.create({
      data: { ...data, ...numbers, companyId, ...createdBy(actorId) },
      select: detailSelect,
    });
  },

  /** Invoiced subtotals of the other (non-cancelled) bills of an order — to refuse billing more than was ordered. */
  async billedForOrder(companyId: string, orderId: string, client: DbClient = db) {
    const result = await client.supplierInvoice.aggregate({
      where: { companyId, orderId, status: { not: "CANCELLED" } },
      _sum: { subtotal: true },
    });
    return result._sum.subtotal?.toString() ?? "0";
  },

  /** Locks the bill row, so two payments can't both see the old balance and overpay. Raw SQL, scoped by company. */
  async lock(companyId: string, id: string, client: DbClient): Promise<boolean> {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT id::text AS id FROM supplier_invoices
      WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid
      FOR UPDATE`);
    return lockRows.parse(rows).length === 1;
  },

  async setState(
    companyId: string,
    id: string,
    data: {
      amountPaid?: string;
      status: SupplierInvoiceStatus;
      cancelledAt?: Date | null;
      cancelReason?: string | null;
    },
    actorId: ActorId,
    client: DbClient,
  ) {
    const { count } = await client.supplierInvoice.updateMany({
      where: { id, companyId },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Unpaid balances (open bills) — Accounts Payable aging. */
  listOpen(companyId: string, client: DbClient = db) {
    return client.supplierInvoice.findMany({
      where: { companyId, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      select: listSelect,
      orderBy: { invoiceDate: "asc" },
    });
  },

  listForSupplier(companyId: string, supplierId: string, client: DbClient = db) {
    return client.supplierInvoice.findMany({
      where: { companyId, supplierId },
      select: listSelect,
      orderBy: { number: "desc" },
      take: 100,
    });
  },

  // ─── Payments ───

  createPayment(
    companyId: string,
    number: number,
    data: {
      supplierId: string;
      invoiceId: string;
      amount: string;
      method: Prisma.SupplierPaymentUncheckedCreateInput["method"];
      reference: string | null;
      paymentDate: Date;
      notes: string | null;
    },
    actorId: ActorId,
    client: DbClient,
  ) {
    return client.supplierPayment.create({
      data: { ...data, number, companyId, createdById: actorId },
      select: paymentSelect,
    });
  },

  findPayment(companyId: string, id: string, client: DbClient = db) {
    return client.supplierPayment.findFirst({ where: { id, companyId }, select: paymentSelect });
  },

  /** Marks a payment voided, only if it isn't already. */
  async voidPayment(companyId: string, id: string, reason: string, actorId: ActorId, client: DbClient) {
    const { count } = await client.supplierPayment.updateMany({
      where: { id, companyId, voidedAt: null },
      data: { voidedAt: new Date(), voidReason: reason, voidedById: actorId },
    });
    return count > 0;
  },

  /** Sum of the valid (not voided) payments of a bill. */
  async paidTotal(companyId: string, invoiceId: string, client: DbClient) {
    const result = await client.supplierPayment.aggregate({
      where: { companyId, invoiceId, voidedAt: null },
      _sum: { amount: true },
    });
    return result._sum.amount?.toString() ?? "0";
  },

  async listPayments(
    companyId: string,
    query: { page: number; pageSize: number; supplierId?: string; search?: string },
    client: DbClient = db,
  ) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("supplierPayment", search) : undefined;
    const where: Prisma.SupplierPaymentWhereInput = {
      companyId,
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(search
        ? {
            OR: [
              { supplier: { name: { contains: search, mode: "insensitive" } } },
              { reference: { contains: search, mode: "insensitive" } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.supplierPayment.findMany({
        where,
        select: paymentSelect,
        orderBy: [{ paymentDate: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.supplierPayment.count({ where }),
    ]);
    return toPage(items, total, query);
  },
};
