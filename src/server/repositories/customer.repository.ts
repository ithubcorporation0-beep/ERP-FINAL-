import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CustomerInput, PaginationInput } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const monthlyCountRows = z.array(z.object({ month: z.string(), count: z.number().int() }));

export const customerRepository = {
  async list(companyId: string, query: PaginationInput, client: DbClient = db) {
    const where: Prisma.CustomerWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await Promise.all([
      client.customer.findMany({ where, orderBy: { createdAt: "desc" }, ...pageArgs(query) }),
      client.customer.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.customer.findFirst({ where: { id, companyId, deletedAt: null } });
  },

  create(companyId: string, data: CustomerInput, actorId: ActorId, client: DbClient = db) {
    return client.customer.create({ data: { ...data, companyId, ...createdBy(actorId) } });
  },

  /** `companyId` in the filter guarantees a row of another company is never touched. */
  async update(
    companyId: string,
    id: string,
    data: Partial<CustomerInput>,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    await client.customer.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { ...data, ...updatedBy(actorId) },
    });
    return client.customer.findFirst({ where: { id, companyId } });
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
