import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { AuditLogQuery } from "@/lib/validation";
import { pageArgs, toPage, type DbClient } from "./helpers";

const listSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  ipAddress: true,
  createdAt: true,
  metadata: true,
  actor: { select: { id: true, name: true, email: true } },
} as const;

/**
 * Append-only: there is intentionally no update or delete (and the database refuses both — trigger
 * `audit_logs_append_only`). Reads are always scoped to one company.
 */
export const auditLogRepository = {
  create(data: Omit<Prisma.AuditLogUncheckedCreateInput, "id" | "createdAt">, client: DbClient = db) {
    return client.auditLog.create({ data, select: { id: true } });
  },

  /** Change history of one record, newest first, with the actor's name. */
  listForEntity(
    companyId: string,
    entityType: string,
    entityId: string,
    { limit }: { limit: number },
    client: DbClient = db,
  ) {
    return client.auditLog.findMany({
      where: { companyId, entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        before: true,
        after: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    });
  },

  /**
   * The audit log viewer. `bounds` are UTC instants of the chosen calendar days in the company's time zone
   * (from inclusive, to exclusive).
   */
  async list(
    companyId: string,
    query: AuditLogQuery,
    bounds: { from?: Date; to?: Date },
    client: DbClient = db,
  ) {
    const search = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(query.action
        ? query.action.includes(".")
          ? { action: query.action }
          : { action: { startsWith: `${query.action}.` } }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(bounds.from || bounds.to
        ? {
            createdAt: {
              ...(bounds.from ? { gte: bounds.from } : {}),
              ...(bounds.to ? { lt: bounds.to } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { action: { contains: search, mode: "insensitive" } },
              { entityType: { contains: search, mode: "insensitive" } },
              { entityId: { equals: search } },
              { ipAddress: { equals: search } },
              { actor: { name: { contains: search, mode: "insensitive" } } },
              { actor: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.auditLog.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: "desc" },
        ...pageArgs(query),
      }),
      client.auditLog.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.auditLog.findFirst({
      where: { id, companyId },
      select: { ...listSelect, before: true, after: true, userAgent: true },
    });
  },

  /** Entity types and actors that appear in this company's log (filter options). */
  async filterOptions(companyId: string, client: DbClient = db) {
    const [entityTypes, actions, actors] = await Promise.all([
      client.auditLog.groupBy({ by: ["entityType"], where: { companyId }, orderBy: { entityType: "asc" } }),
      client.auditLog.groupBy({ by: ["action"], where: { companyId }, orderBy: { action: "asc" } }),
      client.auditLog.groupBy({ by: ["actorId"], where: { companyId, actorId: { not: null } } }),
    ]);
    const users = await client.user.findMany({
      where: { id: { in: actors.flatMap((row) => (row.actorId ? [row.actorId] : [])) } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    return {
      entityTypes: entityTypes.map((row) => row.entityType),
      actions: actions.map((row) => row.action),
      actors: users,
    };
  },
};
