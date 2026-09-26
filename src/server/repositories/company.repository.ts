import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createdBy, type ActorId, type DbClient } from "./helpers";

const summary = {
  id: true,
  name: true,
  slug: true,
  baseCurrency: true,
  timezone: true,
  locale: true,
} as const;

export const companyRepository = {
  /** Active (not deleted) company by id. */
  findById(id: string, client: DbClient = db) {
    return client.company.findFirst({ where: { id, deletedAt: null }, select: summary });
  },

  /** Ids of all active companies (used by the seed to refresh built-in roles everywhere). */
  listIds(client: DbClient = db) {
    return client.company.findMany({ where: { deletedAt: null }, select: { id: true } });
  },

  findBySlug(slug: string, client: DbClient = db) {
    return client.company.findUnique({ where: { slug }, select: summary });
  },

  create(data: Omit<Prisma.CompanyUncheckedCreateInput, "id">, actorId: ActorId, client: DbClient = db) {
    return client.company.create({ data: { ...data, ...createdBy(actorId) }, select: summary });
  },
};
