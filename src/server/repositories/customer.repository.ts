import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { CustomerInput, PaginationInput } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

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
};
