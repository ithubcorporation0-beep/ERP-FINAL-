import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { PaymentListQuery } from "@/lib/validation";
import { pageArgs, toPage, type ActorId, type DbClient } from "./helpers";

const select = {
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
  customer: { select: { id: true, name: true } },
  invoice: { select: { id: true, code: true, currency: true } },
  createdBy: { select: { name: true } },
  voidedBy: { select: { name: true } },
} as const;

export interface PaymentData {
  customerId: string;
  invoiceId: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  paymentDate: Date;
  notes: string | null;
}

export const paymentRepository = {
  async list(companyId: string, query: PaymentListQuery, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("payment", search) : undefined;
    const where: Prisma.PaymentWhereInput = {
      companyId,
      ...(query.method ? { method: query.method } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: "insensitive" } },
              { invoice: { code: { contains: search, mode: "insensitive" } } },
              { customer: { name: { contains: search, mode: "insensitive" } } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.payment.findMany({ where, select, orderBy: [{ number: "desc" }], ...pageArgs(query) }),
      client.payment.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.payment.findFirst({ where: { id, companyId }, select: { ...select, invoiceId: true } });
  },

  listForInvoice(companyId: string, invoiceId: string, client: DbClient = db) {
    return client.payment.findMany({ where: { companyId, invoiceId }, select, orderBy: [{ number: "asc" }] });
  },

  listForCustomer(companyId: string, customerId: string, client: DbClient = db) {
    return client.payment.findMany({
      where: { companyId, customerId },
      select,
      orderBy: [{ number: "desc" }],
      take: 100,
    });
  },

  /** Σ amount of the invoice's payments that aren't voided — the source of truth for `invoices.amount_paid`. */
  async sumActive(companyId: string, invoiceId: string, client: DbClient = db) {
    const result = await client.payment.aggregate({
      where: { companyId, invoiceId, voidedAt: null },
      _sum: { amount: true },
    });
    return result._sum.amount;
  },

  create(companyId: string, number: number, data: PaymentData, actorId: ActorId, client: DbClient = db) {
    return client.payment.create({ data: { ...data, number, companyId, createdById: actorId }, select });
  },

  void(companyId: string, id: string, reason: string, actorId: ActorId, client: DbClient = db) {
    return client.payment.updateMany({
      where: { id, companyId, voidedAt: null },
      data: { voidedAt: new Date(), voidReason: reason, voidedById: actorId },
    });
  },

  listRecent(companyId: string, limit: number, client: DbClient = db) {
    return client.payment.findMany({
      where: { companyId, voidedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        number: true,
        amount: true,
        createdAt: true,
        customer: { select: { name: true } },
        invoice: { select: { code: true, currency: true } },
      },
    });
  },
};
