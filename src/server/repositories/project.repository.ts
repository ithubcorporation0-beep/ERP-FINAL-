import type { Prisma, ProjectStatus } from "@/generated/prisma/client";
import { OPEN_PROJECT_STATUSES } from "@/config/projects";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { ProjectListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  number: true,
  name: true,
  customerId: true,
  managerId: true,
  startDate: true,
  endDate: true,
  budget: true,
  currency: true,
  status: true,
  description: true,
  completedAt: true,
  createdAt: true,
  customer: { select: { id: true, number: true, name: true } },
  manager: { select: { id: true, number: true, name: true, userId: true } },
  createdBy: { select: { name: true } },
} as const;

/** Only projects this employee manages or has tasks in — for people who may see their own work only. */
export interface ProjectScope {
  employeeId?: string;
}

function scopeFilter(scope: ProjectScope): Prisma.ProjectWhereInput {
  return scope.employeeId
    ? {
        OR: [
          { managerId: scope.employeeId },
          { tasks: { some: { assigneeId: scope.employeeId, deletedAt: null } } },
        ],
      }
    : {};
}

export type ProjectData = Pick<
  Prisma.ProjectUncheckedCreateInput,
  | "name"
  | "customerId"
  | "managerId"
  | "startDate"
  | "endDate"
  | "budget"
  | "status"
  | "description"
  | "completedAt"
>;

const OPEN: ProjectStatus[] = [...OPEN_PROJECT_STATUSES];

export const projectRepository = {
  async list(companyId: string, query: ProjectListQuery, scope: ProjectScope, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("project", search) : undefined;
    const where: Prisma.ProjectWhereInput = {
      companyId,
      deletedAt: null,
      AND: [
        scopeFilter(scope),
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { customer: { name: { contains: search, mode: "insensitive" } } },
                ...(number === undefined ? [] : [{ number }]),
              ],
            }
          : {},
      ],
      ...(query.status === "open" ? { status: { in: OPEN } } : query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    };
    const [items, total] = await Promise.all([
      client.project.findMany({
        where,
        select,
        orderBy: [{ status: "asc" }, { endDate: { sort: "asc", nulls: "last" } }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.project.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, scope: ProjectScope, client: DbClient = db) {
    return client.project.findFirst({
      where: { id, companyId, deletedAt: null, AND: [scopeFilter(scope)] },
      select,
    });
  },

  /** Projects to pick from on task forms (open ones, visible to the user). */
  options(companyId: string, scope: ProjectScope, client: DbClient = db) {
    return client.project.findMany({
      where: { companyId, deletedAt: null, status: { in: OPEN }, AND: [scopeFilter(scope)] },
      select: { id: true, number: true, name: true },
      orderBy: [{ name: "asc" }],
    });
  },

  create(
    companyId: string,
    number: number,
    currency: string,
    data: ProjectData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.project.create({
      data: { ...data, number, currency, companyId, ...createdBy(actorId) },
      select,
    });
  },

  async update(
    companyId: string,
    id: string,
    data: Prisma.ProjectUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.project.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Soft delete — only a project without (non-deleted) tasks. */
  softDelete(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.project.updateMany({
      where: { id, companyId, deletedAt: null, tasks: { none: { deletedAt: null } } },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  /** Number of visible projects per status (dashboard, reports). */
  async countByStatus(companyId: string, scope: ProjectScope, client: DbClient = db) {
    const rows = await client.project.groupBy({
      by: ["status"],
      where: { companyId, deletedAt: null, AND: [scopeFilter(scope)] },
      _count: { _all: true },
    });
    return rows.map((row) => ({ status: row.status, count: row._count._all }));
  },

  countActive(
    companyId: string,
    scope: ProjectScope,
    created: { from?: Date; to?: Date } = {},
    client: DbClient = db,
  ) {
    return client.project.count({
      where: {
        companyId,
        deletedAt: null,
        status: "ACTIVE",
        AND: [scopeFilter(scope)],
        ...(created.from || created.to
          ? {
              createdAt: {
                ...(created.from ? { gte: created.from } : {}),
                ...(created.to ? { lt: created.to } : {}),
              },
            }
          : {}),
      },
    });
  },

  /** Every visible project that isn't deleted (reports). */
  listAll(companyId: string, scope: ProjectScope, client: DbClient = db) {
    return client.project.findMany({
      where: { companyId, deletedAt: null, AND: [scopeFilter(scope)] },
      select,
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: 1000,
    });
  },

  /** Open projects ending on or before `until` (deadline reminders). */
  listEndingForReminder(companyId: string, until: Date, client: DbClient = db) {
    return client.project.findMany({
      where: { companyId, deletedAt: null, status: { in: OPEN }, endDate: { lte: until } },
      select: { id: true, number: true, name: true, endDate: true, manager: { select: { userId: true } } },
      take: 500,
    });
  },

  listRecent(companyId: string, scope: ProjectScope, limit: number, client: DbClient = db) {
    return client.project.findMany({
      where: { companyId, deletedAt: null, AND: [scopeFilter(scope)] },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, number: true, name: true, status: true, updatedAt: true, createdAt: true },
    });
  },
};
