import type { LeadStatus, Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/crm";
import { db } from "@/lib/db";
import type { LeadListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

/** Writable lead columns, already normalised by the service. */
export type LeadData = Omit<
  Prisma.LeadUncheckedCreateInput,
  "id" | "companyId" | "number" | "createdAt" | "updatedAt" | "createdById" | "updatedById" | "deletedAt"
>;

const listSelect = {
  id: true,
  number: true,
  name: true,
  companyName: true,
  email: true,
  phone: true,
  source: true,
  status: true,
  expectedValue: true,
  followUpDate: true,
  statusChangedAt: true,
  customerId: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

const detailSelect = {
  ...listSelect,
  notes: true,
  updatedAt: true,
  customer: { select: { id: true, number: true, name: true, deletedAt: true } },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} as const;

export type LeadFilters = Omit<LeadListQuery, "page" | "pageSize"> & { currentUserId: string };

function where(companyId: string, filters: LeadFilters): Prisma.LeadWhereInput {
  const contains = filters.search ? ({ contains: filters.search, mode: "insensitive" } as const) : undefined;
  const number = filters.search ? parseRecordNumber("lead", filters.search) : undefined;
  return {
    companyId,
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.assignee === "me"
      ? { assignedToId: filters.currentUserId }
      : filters.assignee === "none"
        ? { assignedToId: null }
        : filters.assignee
          ? { assignedToId: filters.assignee }
          : {}),
    ...(contains
      ? {
          OR: [
            { name: contains },
            { companyName: contains },
            { email: contains },
            { phone: contains },
            ...(number === undefined ? [] : [{ number }]),
          ],
        }
      : {}),
  };
}

export const leadRepository = {
  async list(companyId: string, query: LeadListQuery & { currentUserId: string }, client: DbClient = db) {
    const filter = where(companyId, query);
    const [items, total] = await Promise.all([
      client.lead.findMany({
        where: filter,
        select: listSelect,
        orderBy: [{ createdAt: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.lead.count({ where: filter }),
    ]);
    return toPage(items, total, query);
  },

  /** Leads of one pipeline stage for the board, most recently moved first. */
  async listStage(
    companyId: string,
    status: LeadStatus,
    filters: LeadFilters,
    limit: number,
    client: DbClient = db,
  ) {
    const filter = { ...where(companyId, filters), status };
    const [items, total, sum] = await Promise.all([
      client.lead.findMany({
        where: filter,
        select: listSelect,
        orderBy: [{ statusChangedAt: "desc" }, { number: "desc" }],
        take: limit,
      }),
      client.lead.count({ where: filter }),
      client.lead.aggregate({ where: filter, _sum: { expectedValue: true } }),
    ]);
    return { items, total, expectedValue: sum._sum.expectedValue };
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.lead.findFirst({ where: { id, companyId, deletedAt: null }, select: detailSelect });
  },

  create(companyId: string, number: number, data: LeadData, actorId: ActorId, client: DbClient = db) {
    return client.lead.create({
      data: { ...data, companyId, number, ...createdBy(actorId) },
      select: detailSelect,
    });
  },

  async update(
    companyId: string,
    id: string,
    data: Partial<LeadData>,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.lead.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count === 0 ? null : client.lead.findFirst({ where: { id, companyId }, select: detailSelect });
  },

  softDelete(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.lead.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  /** Leads converted into this customer (shown on the customer page). */
  listForCustomer(companyId: string, customerId: string, client: DbClient = db) {
    return client.lead.findMany({
      where: { companyId, customerId, deletedAt: null },
      select: { id: true, number: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  },
};
