import type { Prisma, TaskStatus } from "@/generated/prisma/client";
import { DUE_SOON_DAYS } from "@/config/projects";
import { parseRecordNumber } from "@/config/records";
import { addDays, dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { TaskListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  number: true,
  projectId: true,
  name: true,
  assigneeId: true,
  priority: true,
  status: true,
  startDate: true,
  dueDate: true,
  description: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  project: { select: { id: true, number: true, name: true, status: true, managerId: true } },
  assignee: { select: { id: true, number: true, name: true, userId: true } },
  createdBy: { select: { name: true } },
  _count: { select: { attachments: true } },
} as const;

/** Only tasks assigned to this employee, or in projects they manage — for people who see their own work only. */
export interface TaskScope {
  employeeId?: string;
}

function scopeFilter(scope: TaskScope): Prisma.TaskWhereInput {
  return scope.employeeId
    ? { OR: [{ assigneeId: scope.employeeId }, { project: { managerId: scope.employeeId } }] }
    : {};
}

export type TaskData = Pick<
  Prisma.TaskUncheckedCreateInput,
  | "name"
  | "projectId"
  | "assigneeId"
  | "priority"
  | "status"
  | "startDate"
  | "dueDate"
  | "description"
  | "completedAt"
>;

const OPEN: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW"];

export const taskRepository = {
  async list(
    companyId: string,
    query: TaskListQuery & { today: string },
    scope: TaskScope,
    client: DbClient = db,
  ) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("task", search) : undefined;
    const where: Prisma.TaskWhereInput = {
      companyId,
      deletedAt: null,
      project: { deletedAt: null },
      AND: [
        scopeFilter(scope),
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { project: { name: { contains: search, mode: "insensitive" } } },
                ...(number === undefined ? [] : [{ number }]),
              ],
            }
          : {},
        query.due === "overdue"
          ? { status: { in: OPEN }, dueDate: { lt: dateOnlyToDate(query.today) } }
          : query.due === "soon"
            ? {
                status: { in: OPEN },
                dueDate: {
                  gte: dateOnlyToDate(query.today),
                  lte: dateOnlyToDate(addDays(query.today, DUE_SOON_DAYS)),
                },
              }
            : {},
      ],
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.status === "open" ? { status: { in: OPEN } } : query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
    };
    const [items, total] = await Promise.all([
      client.task.findMany({
        where,
        select,
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.task.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  /** Tasks for the Kanban board: urgent first, then by due date. */
  board(
    companyId: string,
    filter: { projectId?: string; assigneeId?: string },
    scope: TaskScope,
    client: DbClient = db,
  ) {
    return client.task.findMany({
      where: {
        companyId,
        deletedAt: null,
        project: { deletedAt: null },
        AND: [scopeFilter(scope)],
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
      },
      select,
      orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }, { number: "asc" }],
      take: 500,
    });
  },

  findById(companyId: string, id: string, scope: TaskScope, client: DbClient = db) {
    return client.task.findFirst({
      where: { id, companyId, deletedAt: null, project: { deletedAt: null }, AND: [scopeFilter(scope)] },
      select,
    });
  },

  create(companyId: string, number: number, data: TaskData, actorId: ActorId, client: DbClient = db) {
    return client.task.create({ data: { ...data, number, companyId, ...createdBy(actorId) }, select });
  },

  async update(
    companyId: string,
    id: string,
    data: Prisma.TaskUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
    onlyFrom?: TaskStatus,
  ) {
    const { count } = await client.task.updateMany({
      where: { id, companyId, deletedAt: null, ...(onlyFrom ? { status: onlyFrom } : {}) },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  softDelete(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.task.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  /** Status and due date of the tasks of these projects (progress and deadlines). */
  listForProjects(companyId: string, projectIds: readonly string[], client: DbClient = db) {
    return client.task.findMany({
      where: { companyId, deletedAt: null, projectId: { in: [...projectIds] } },
      select: { projectId: true, status: true, dueDate: true, assigneeId: true },
    });
  },

  /** Open tasks per assignee and whether they are overdue (workload report). */
  listOpen(companyId: string, scope: TaskScope, client: DbClient = db) {
    return client.task.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: OPEN },
        project: { deletedAt: null },
        AND: [scopeFilter(scope)],
      },
      select: {
        status: true,
        dueDate: true,
        priority: true,
        assignee: { select: { id: true, number: true, name: true } },
      },
    });
  },

  /** Open, assigned tasks of open projects due on or before `until` (deadline reminders). */
  listDueForReminder(companyId: string, until: Date, client: DbClient = db) {
    return client.task.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: OPEN },
        dueDate: { lte: until },
        project: { deletedAt: null, status: { in: ["PLANNING", "ACTIVE", "ON_HOLD"] } },
      },
      select: {
        id: true,
        number: true,
        name: true,
        dueDate: true,
        assignee: { select: { userId: true } },
        project: { select: { name: true, manager: { select: { userId: true } } } },
      },
      take: 1000,
    });
  },

  countOpen(companyId: string, scope: TaskScope, client: DbClient = db) {
    return client.task.count({
      where: {
        companyId,
        deletedAt: null,
        status: { in: OPEN },
        project: { deletedAt: null },
        AND: [scopeFilter(scope)],
      },
    });
  },

  listRecentlyChanged(companyId: string, scope: TaskScope, limit: number, client: DbClient = db) {
    return client.task.findMany({
      where: { companyId, deletedAt: null, project: { deletedAt: null }, AND: [scopeFilter(scope)] },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        updatedAt: true,
        project: { select: { name: true } },
      },
    });
  },
};
