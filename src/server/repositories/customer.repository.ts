import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/crm";
import { db } from "@/lib/db";
import type { CustomerListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const monthlyCountRows = z.array(z.object({ month: z.string(), count: z.number().int() }));

/** Writable customer columns, already normalised by the service ("" → null). */
export type CustomerData = Omit<
  Prisma.CustomerUncheckedCreateInput,
  "id" | "companyId" | "number" | "createdAt" | "updatedAt" | "createdById" | "updatedById" | "deletedAt"
>;

const listSelect = {
  id: true,
  number: true,
  name: true,
  companyName: true,
  email: true,
  phone: true,
  city: true,
  country: true,
  type: true,
  status: true,
  createdAt: true,
} as const;

const detailSelect = {
  ...listSelect,
  whatsapp: true,
  address: true,
  taxId: true,
  notes: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} as const;

function searchFilter(search: string | undefined): Prisma.CustomerWhereInput {
  if (!search) return {};
  const contains = { contains: search, mode: "insensitive" } as const;
  const number = parseRecordNumber("customer", search);
  return {
    OR: [
      { name: contains },
      { companyName: contains },
      { email: contains },
      { phone: contains },
      { whatsapp: contains },
      { city: contains },
      ...(number === undefined ? [] : [{ number }]),
    ],
  };
}

export const customerRepository = {
  async list(companyId: string, query: CustomerListQuery, client: DbClient = db) {
    const where: Prisma.CustomerWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.country ? { country: query.country } : {}),
      ...searchFilter(query.search),
    };
    const [items, total] = await Promise.all([
      client.customer.findMany({
        where,
        select: listSelect,
        // `number` breaks ties so paging is stable.
        orderBy: [{ [query.sort]: query.dir }, { number: query.dir }],
        ...pageArgs(query),
      }),
      client.customer.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.customer.findFirst({ where: { id, companyId, deletedAt: null }, select: detailSelect });
  },

  /** Active customers for pickers (e.g. on quotations), alphabetical. */
  listOptions(companyId: string, limit: number, client: DbClient = db) {
    return client.customer.findMany({
      where: { companyId, deletedAt: null, status: { not: "BLOCKED" } },
      orderBy: { name: "asc" },
      take: limit,
      select: { id: true, number: true, name: true, companyName: true },
    });
  },

  /** Minimal lookup for pickers and links (e.g. "converted to CUS-0012"). */
  findSummary(companyId: string, id: string, client: DbClient = db) {
    return client.customer.findFirst({
      where: { id, companyId },
      select: { id: true, number: true, name: true, deletedAt: true },
    });
  },

  create(companyId: string, number: number, data: CustomerData, actorId: ActorId, client: DbClient = db) {
    return client.customer.create({
      data: { ...data, companyId, number, ...createdBy(actorId) },
      select: detailSelect,
    });
  },

  /** `companyId` in the filter guarantees a row of another company is never touched. */
  async update(
    companyId: string,
    id: string,
    data: Partial<CustomerData>,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.customer.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count === 0 ? null : client.customer.findFirst({ where: { id, companyId }, select: detailSelect });
  },

  softDelete(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.customer.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  // ─── Dashboard figures (active customers only) ───

  /** Active customers, optionally only those created in `from` ≤ created_at < `to`. */
  countActive(companyId: string, created: { from?: Date; to?: Date } = {}, client: DbClient = db) {
    return client.customer.count({
      where: { companyId, deletedAt: null, createdAt: { gte: created.from, lt: created.to } },
    });
  },

  /**
   * New active customers per calendar month of `timeZone`, for `from` ≤ created_at < `to`. Months without
   * customers are absent. Raw SQL because Prisma cannot group by month; the tenant guard does not see raw
   * queries, so `company_id` is filtered here explicitly (covered by tests/integration/dashboard.test.ts).
   */
  async countCreatedByMonth(
    companyId: string,
    { from, to, timeZone }: { from: Date; to: Date; timeZone: string },
    client: DbClient = db,
  ) {
    const rows = await client.$queryRaw(Prisma.sql`
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE ${timeZone}), 'YYYY-MM') AS month,
             count(*)::int AS count
      FROM customers
      WHERE company_id = ${companyId}::uuid
        AND deleted_at IS NULL
        AND created_at >= ${from}
        AND created_at < ${to}
      GROUP BY 1
      ORDER BY 1`);
    return monthlyCountRows.parse(rows);
  },

  listRecent(companyId: string, limit: number, client: DbClient = db) {
    return client.customer.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, name: true, createdAt: true },
    });
  },
};
