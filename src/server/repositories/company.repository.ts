import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const summary = {
  id: true,
  name: true,
  slug: true,
  baseCurrency: true,
  timezone: true,
  locale: true,
} as const;

const profile = {
  ...summary,
  legalName: true,
  taxId: true,
  email: true,
  phone: true,
  address: true,
  country: true,
  fiscalYearStartMonth: true,
  status: true,
  logoKey: true,
  logoContentType: true,
  logoUpdatedAt: true,
  updatedAt: true,
} as const;

export const companyRepository = {
  /** Active (not deleted) company by id. */
  findById(id: string, client: DbClient = db) {
    return client.company.findFirst({ where: { id, deletedAt: null }, select: summary });
  },

  /** Full profile of an active company. The caller passes the CURRENT company's id (ctx.companyId). */
  findProfile(id: string, client: DbClient = db) {
    return client.company.findFirst({ where: { id, deletedAt: null }, select: profile });
  },

  update(
    id: string,
    data: Omit<Prisma.CompanyUncheckedUpdateInput, "id" | "slug" | "createdAt" | "createdById" | "deletedAt">,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.company.update({
      where: { id },
      data: { ...data, ...updatedBy(actorId) },
      select: profile,
    });
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
