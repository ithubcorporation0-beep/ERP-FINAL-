import type { ExpenseCategory, ExpenseStatus, Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { ExpenseListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

export type ExpenseData = Pick<
  Prisma.ExpenseUncheckedCreateInput,
  "category" | "amount" | "expenseDate" | "vendor" | "paymentMethod" | "description" | "employeeId"
>;

const select = {
  id: true,
  number: true,
  category: true,
  amount: true,
  currency: true,
  expenseDate: true,
  vendor: true,
  paymentMethod: true,
  description: true,
  employeeId: true,
  status: true,
  decisionNote: true,
  decidedAt: true,
  paidAt: true,
  paidMethod: true,
  receiptKey: true,
  receiptName: true,
  receiptContentType: true,
  receiptSize: true,
  createdAt: true,
  createdById: true,
  employee: { select: { id: true, name: true } },
  decidedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

export interface ExpenseScope {
  /** Only expenses of (or created by) this user — for people who may see their own expenses only. */
  ownerId?: string;
}

function ownerFilter(scope: ExpenseScope): Prisma.ExpenseWhereInput {
  return scope.ownerId ? { OR: [{ employeeId: scope.ownerId }, { createdById: scope.ownerId }] } : {};
}

export const expenseRepository = {
  async list(companyId: string, query: ExpenseListQuery, scope: ExpenseScope, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("expense", search) : undefined;
    const where: Prisma.ExpenseWhereInput = {
      companyId,
      deletedAt: null,
      AND: [
        ownerFilter(scope),
        search
          ? {
              OR: [
                { vendor: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                ...(number === undefined ? [] : [{ number }]),
              ],
            }
          : {},
      ],
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [items, total] = await Promise.all([
      client.expense.findMany({
        where,
        select,
        orderBy: [{ expenseDate: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.expense.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, scope: ExpenseScope, client: DbClient = db) {
    return client.expense.findFirst({
      where: { id, companyId, deletedAt: null, ...ownerFilter(scope) },
      select,
    });
  },

  create(
    companyId: string,
    number: number,
    currency: string,
    data: ExpenseData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.expense.create({
      data: { ...data, number, currency, companyId, ...createdBy(actorId) },
      select,
    });
  },

  /** Updates only while the expense is in one of `from` statuses (checked in the UPDATE). */
  async update(
    companyId: string,
    id: string,
    from: readonly ExpenseStatus[],
    data: Prisma.ExpenseUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.expense.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...from] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  softDelete(
    companyId: string,
    id: string,
    from: readonly ExpenseStatus[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.expense.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...from] } },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  // ─── Reports and dashboard (approved expenses only) ───

  async sumApproved(companyId: string, dates: { from?: string; to?: string }, client: DbClient = db) {
    const result = await client.expense.aggregate({
      where: {
        companyId,
        deletedAt: null,
        status: "APPROVED",
        expenseDate: {
          ...(dates.from ? { gte: dateOnlyToDate(dates.from) } : {}),
          ...(dates.to ? { lt: dateOnlyToDate(dates.to) } : {}),
        },
      },
      _sum: { amount: true },
    });
    return result._sum.amount;
  },

  async approvedBy(
    companyId: string,
    by: "category" | "vendor",
    dates: { from: string; to: string },
    client: DbClient = db,
  ) {
    const rows = await client.expense.groupBy({
      by: [by],
      where: {
        companyId,
        deletedAt: null,
        status: "APPROVED",
        expenseDate: { gte: dateOnlyToDate(dates.from), lt: dateOnlyToDate(dates.to) },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      key: (by === "category" ? row.category : row.vendor) ?? null,
      total: row._sum.amount?.toString() ?? "0",
      count: row._count._all,
    }));
  },

  /** Approved expenses bought on credit and not paid yet (accounts payable). */
  listUnpaid(companyId: string, client: DbClient = db) {
    return client.expense.findMany({
      where: { companyId, deletedAt: null, status: "APPROVED", paymentMethod: "UNPAID", paidAt: null },
      select,
      orderBy: [{ expenseDate: "asc" }],
    });
  },

  listRecent(companyId: string, limit: number, client: DbClient = db) {
    return client.expense.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        number: true,
        amount: true,
        currency: true,
        category: true,
        vendor: true,
        createdAt: true,
      },
    });
  },
};

export type { ExpenseCategory };
