import type { LeaveStatus, Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { LeaveListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";
import type { DayRange } from "./attendance.repository";

const select = {
  id: true,
  number: true,
  employeeId: true,
  type: true,
  startDate: true,
  endDate: true,
  days: true,
  reason: true,
  attachmentKey: true,
  attachmentName: true,
  attachmentContentType: true,
  attachmentSize: true,
  status: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
  createdById: true,
  employee: { select: { id: true, number: true, name: true, userId: true } },
  decidedBy: { select: { name: true } },
  createdBy: { select: { name: true } },
} as const;

export interface LeaveScope {
  /** Only this employee's requests — for people who may see their own leave only. */
  employeeId?: string;
}

export type LeaveData = Pick<
  Prisma.LeaveRequestUncheckedCreateInput,
  "employeeId" | "type" | "startDate" | "endDate" | "days" | "reason"
>;

export const leaveRepository = {
  async list(companyId: string, query: LeaveListQuery, scope: LeaveScope, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("leave", search) : undefined;
    const where: Prisma.LeaveRequestWhereInput = {
      companyId,
      deletedAt: null,
      // The scope (own requests only) always wins over the employee filter.
      ...(scope.employeeId
        ? { employeeId: scope.employeeId }
        : query.employeeId
          ? { employeeId: query.employeeId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(search
        ? {
            OR: [
              { employee: { name: { contains: search, mode: "insensitive" } } },
              { reason: { contains: search, mode: "insensitive" } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.leaveRequest.findMany({
        where,
        select,
        orderBy: [{ startDate: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.leaveRequest.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, scope: LeaveScope, client: DbClient = db) {
    return client.leaveRequest.findFirst({
      where: {
        id,
        companyId,
        deletedAt: null,
        ...(scope.employeeId ? { employeeId: scope.employeeId } : {}),
      },
      select,
    });
  },

  create(companyId: string, number: number, data: LeaveData, actorId: ActorId, client: DbClient = db) {
    return client.leaveRequest.create({
      data: { ...data, number, companyId, ...createdBy(actorId) },
      select,
    });
  },

  /** Updates only while the request is in one of `from` statuses (checked in the UPDATE). */
  async update(
    companyId: string,
    id: string,
    from: readonly LeaveStatus[],
    data: Prisma.LeaveRequestUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.leaveRequest.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...from] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  softDelete(
    companyId: string,
    id: string,
    from: readonly LeaveStatus[],
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.leaveRequest.updateMany({
      where: { id, companyId, deletedAt: null, status: { in: [...from] } },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },

  /** Pending or approved requests of an employee that share a day with [start, end]. */
  findOverlapping(
    companyId: string,
    employeeId: string,
    range: { start: string; end: string },
    excludeId: string | null,
    client: DbClient = db,
  ) {
    return client.leaveRequest.findFirst({
      where: {
        companyId,
        employeeId,
        deletedAt: null,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: dateOnlyToDate(range.end) },
        endDate: { gte: dateOnlyToDate(range.start) },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, number: true, status: true },
    });
  },

  /** Approved leave touching [from, to] (for attendance). */
  listApproved(companyId: string, days: DayRange, employeeIds?: readonly string[], client: DbClient = db) {
    return client.leaveRequest.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: "APPROVED",
        startDate: { lte: dateOnlyToDate(days.to) },
        endDate: { gte: dateOnlyToDate(days.from) },
        ...(employeeIds ? { employeeId: { in: [...employeeIds] } } : {}),
      },
      select: { employeeId: true, startDate: true, endDate: true, type: true },
    });
  },

  countPending(companyId: string, client: DbClient = db) {
    return client.leaveRequest.count({ where: { companyId, deletedAt: null, status: "PENDING" } });
  },

  listRecent(companyId: string, limit: number, client: DbClient = db) {
    return client.leaveRequest.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        number: true,
        type: true,
        days: true,
        status: true,
        createdAt: true,
        employee: { select: { name: true } },
      },
    });
  },
};
