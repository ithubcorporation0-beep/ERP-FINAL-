import type { AttendanceSource, AttendanceStatus, Prisma } from "@/generated/prisma/client";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import {
  createdBy,
  pageArgs,
  toPage,
  updatedBy,
  type ActorId,
  type DbClient,
  type PageQuery,
} from "./helpers";

const select = {
  id: true,
  employeeId: true,
  date: true,
  checkInAt: true,
  checkOutAt: true,
  status: true,
  lateMinutes: true,
  earlyLeaveMinutes: true,
  workedMinutes: true,
  source: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  employee: { select: { id: true, number: true, name: true } },
  updatedBy: { select: { name: true } },
} as const;

export interface AttendanceData {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  status: AttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number | null;
  source: AttendanceSource;
  note: string | null;
}

/** Calendar-date bounds, both included ("YYYY-MM-DD"). */
export interface DayRange {
  from: string;
  to: string;
}

function dayFilter({ from, to }: DayRange): Prisma.DateTimeFilter {
  return { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) };
}

export const attendanceRepository = {
  findById(companyId: string, id: string, client: DbClient = db) {
    return client.attendanceRecord.findFirst({ where: { id, companyId }, select });
  },

  findDay(companyId: string, employeeId: string, date: string, client: DbClient = db) {
    return client.attendanceRecord.findFirst({
      where: { companyId, employeeId, date: dateOnlyToDate(date) },
      select,
    });
  },

  create(
    companyId: string,
    employeeId: string,
    date: string,
    data: AttendanceData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.attendanceRecord.create({
      data: { ...data, companyId, employeeId, date: dateOnlyToDate(date), ...createdBy(actorId) },
      select,
    });
  },

  /** Updates the record; `onlyOpen` limits it to a day without a check-out (a concurrent check-out wins once). */
  async update(
    companyId: string,
    id: string,
    data: Partial<AttendanceData>,
    actorId: ActorId,
    client: DbClient = db,
    onlyOpen = false,
  ) {
    const { count } = await client.attendanceRecord.updateMany({
      where: { id, companyId, ...(onlyOpen ? { checkOutAt: null } : {}) },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  delete(companyId: string, id: string, client: DbClient = db) {
    return client.attendanceRecord.deleteMany({ where: { id, companyId } });
  },

  /** History, newest first; `employeeId` limits it to one person (always set for people who see only their own). */
  async list(
    companyId: string,
    query: PageQuery & { employeeId?: string; days: DayRange },
    client: DbClient = db,
  ) {
    const where: Prisma.AttendanceRecordWhereInput = {
      companyId,
      date: dayFilter(query.days),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    };
    const [items, total] = await Promise.all([
      client.attendanceRecord.findMany({
        where,
        select,
        orderBy: [{ date: "desc" }, { employee: { name: "asc" } }],
        ...pageArgs(query),
      }),
      client.attendanceRecord.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  /** Every record in the range (for reports and the dashboard). */
  listRange(companyId: string, days: DayRange, employeeIds?: readonly string[], client: DbClient = db) {
    return client.attendanceRecord.findMany({
      where: {
        companyId,
        date: dayFilter(days),
        ...(employeeIds ? { employeeId: { in: [...employeeIds] } } : {}),
      },
      select: {
        employeeId: true,
        date: true,
        status: true,
        lateMinutes: true,
        earlyLeaveMinutes: true,
        workedMinutes: true,
        checkInAt: true,
        checkOutAt: true,
      },
    });
  },
};
