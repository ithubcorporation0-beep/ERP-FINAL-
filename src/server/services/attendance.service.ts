import "server-only";
import { WORKFORCE_STATUSES, type DayStatusKey } from "@/config/hr";
import {
  addDay,
  clockMinutes,
  dayStatus,
  emptyTotals,
  employedOn,
  evaluateDay,
  isWorkDay,
  localClock,
  workingDays,
  type AttendanceTotals,
} from "@/lib/attendance";
import { addDays, dateToDateOnly, zonedInstant, type DateRangePreset } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { AttendanceEntryInput, AttendanceListQuery } from "@/lib/validation";
import { attendanceRepository, type DayRange } from "@/server/repositories/attendance.repository";
import { employeeRepository } from "@/server/repositories/employee.repository";
import { leaveRepository } from "@/server/repositories/leave.repository";
import { writeAuditLog } from "./audit.service";
import { ownEmployee, workSchedule } from "./hr-shared";
import { periodBounds, salesContext } from "./sales-shared";

/**
 * Attendance. Employees check in / out for themselves (`attendance:create`, server time only — the client never
 * sends a timestamp). HR enters or corrects days (`attendance:edit`) and deletes records (`attendance:delete`).
 * People with `attendance:edit`, `attendance:approve` or `employees:view` see everyone's attendance; others only
 * their own. Late / early / half-day rules: src/lib/attendance.ts and docs/hr.md.
 */

function seesAll(ctx: TenantContext): boolean {
  return can(ctx, "attendance:edit") || can(ctx, "attendance:approve") || can(ctx, "employees:view");
}

function assertSeesAll(ctx: TenantContext) {
  authorize(ctx, "attendance:view");
  if (!seesAll(ctx)) throw new ForbiddenError();
}

async function clock(ctx: TenantContext) {
  const [{ timeZone, today }, schedule] = await Promise.all([salesContext(ctx), workSchedule(ctx)]);
  const now = new Date();
  return { timeZone, today, schedule, now, nowMinutes: localClock(now, timeZone).minutes };
}

type AttendanceRecord = NonNullable<Awaited<ReturnType<typeof attendanceRepository.findById>>>;

function snapshot(record: Pick<AttendanceRecord, "checkInAt" | "checkOutAt" | "status" | "note">) {
  return {
    checkInAt: record.checkInAt?.toISOString() ?? null,
    checkOutAt: record.checkOutAt?.toISOString() ?? null,
    status: record.status,
    note: record.note,
  };
}

interface DayVisit {
  employee: { id: string; number: number; name: string; department: { name: string } | null };
  date: string;
  status: DayStatusKey;
  record: {
    lateMinutes: number;
    earlyLeaveMinutes: number;
    workedMinutes: number | null;
    checkInAt: Date | null;
    checkOutAt: Date | null;
  } | null;
}

/**
 * Walks every working day in `days` for every employee expected at work that day and derives the day's outcome
 * (stored record, approved leave, absent or pending). The single place reports and the dashboard get their numbers.
 */
async function eachWorkingDay(
  ctx: TenantContext,
  days: DayRange,
  filter: { departmentId?: string; employeeId?: string },
  visit: (day: DayVisit) => void,
) {
  const { today, schedule, nowMinutes } = await clock(ctx);
  const to = days.to > today ? today : days.to;
  if (to < days.from) return { schedule, today, days: { from: days.from, to } };
  const employees = await employeeRepository.listForAttendance(
    ctx.companyId,
    { from: days.from, to },
    filter,
  );
  const ids = employees.map((employee) => employee.id);
  const [records, leaves] = await Promise.all([
    attendanceRepository.listRange(ctx.companyId, { from: days.from, to }, ids),
    leaveRepository.listApproved(ctx.companyId, { from: days.from, to }, ids),
  ]);
  const recordByDay = new Map(
    records.map((record) => [`${record.employeeId}:${dateToDateOnly(record.date)}`, record]),
  );
  const dates = workingDays(days.from, to, schedule.workDays);
  for (const employee of employees) {
    const span = {
      status: employee.status,
      joiningDate: dateToDateOnly(employee.joiningDate),
      exitDate: employee.exitDate ? dateToDateOnly(employee.exitDate) : null,
    };
    const ownLeaves = leaves
      .filter((leave) => leave.employeeId === employee.id)
      .map((leave) => ({ start: dateToDateOnly(leave.startDate), end: dateToDateOnly(leave.endDate) }));
    for (const date of dates) {
      if (!employedOn(span, date)) continue;
      const record = recordByDay.get(`${employee.id}:${date}`) ?? null;
      const onLeave = ownLeaves.some((leave) => leave.start <= date && date <= leave.end);
      const status = dayStatus({ record, onLeave, date, today, nowMinutes, schedule });
      visit({ employee, date, status, record });
    }
  }
  return { schedule, today, days: { from: days.from, to } };
}

/** Inclusive calendar days of a period preset. */
async function presetDays(
  ctx: TenantContext,
  preset: DateRangePreset,
): Promise<DayRange & { label: string }> {
  const bounds = await periodBounds(ctx, preset);
  return { from: bounds.from, to: addDays(bounds.to, -1), label: bounds.label };
}

export const attendanceService = {
  seesAll,

  /** The signed-in member's own day: linked employee, today's record and what they can do. */
  async myDay(ctx: TenantContext) {
    authorize(ctx, "attendance:view");
    const [employee, { today, schedule, timeZone }] = await Promise.all([ownEmployee(ctx), clock(ctx)]);
    if (!employee)
      return {
        employee: null,
        record: null,
        today,
        schedule,
        timeZone,
        canCheckIn: false,
        canCheckOut: false,
      };
    const record = await attendanceRepository.findDay(ctx.companyId, employee.id, today);
    const expected =
      WORKFORCE_STATUSES.includes(employee.status) && dateToDateOnly(employee.joiningDate) <= today;
    const canRecord = can(ctx, "attendance:create") && expected;
    return {
      employee,
      record,
      today,
      schedule,
      timeZone,
      canCheckIn: canRecord && !record,
      canCheckOut: canRecord && Boolean(record?.checkInAt) && !record?.checkOutAt,
    };
  },

  async checkIn(ctx: TenantContext) {
    authorize(ctx, "attendance:create");
    const [employee, { today, schedule, timeZone, now }] = await Promise.all([ownEmployee(ctx), clock(ctx)]);
    if (!employee)
      throw new ConflictError("Your login isn't linked to an employee record. Ask HR to link it.");
    if (!WORKFORCE_STATUSES.includes(employee.status) || dateToDateOnly(employee.joiningDate) > today) {
      throw new ConflictError("Attendance isn't recorded for your current employment status.");
    }
    const existing = await attendanceRepository.findDay(ctx.companyId, employee.id, today);
    if (existing?.status === "ABSENT")
      throw new ConflictError("HR marked you absent today. Ask HR to correct it.");
    if (existing) throw new ConflictError("You already checked in today.");
    const evaluation = evaluateDay(now, null, schedule, timeZone);
    return db.$transaction(async (tx) => {
      const record = await attendanceRepository.create(
        ctx.companyId,
        employee.id,
        today,
        { ...evaluation, checkInAt: now, checkOutAt: null, source: "SELF", note: null },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "attendance.check_in",
          entityType: "AttendanceRecord",
          entityId: record.id,
          after: snapshot(record),
        },
        tx,
      );
      return record;
    });
  },

  async checkOut(ctx: TenantContext) {
    authorize(ctx, "attendance:create");
    const [employee, { today, schedule, timeZone, now }] = await Promise.all([ownEmployee(ctx), clock(ctx)]);
    if (!employee)
      throw new ConflictError("Your login isn't linked to an employee record. Ask HR to link it.");
    const record = await attendanceRepository.findDay(ctx.companyId, employee.id, today);
    if (!record?.checkInAt) throw new ConflictError("Check in first.");
    if (record.checkOutAt) throw new ConflictError("You already checked out today.");
    const evaluation = evaluateDay(record.checkInAt, now, schedule, timeZone);
    await db.$transaction(async (tx) => {
      const updated = await attendanceRepository.update(
        ctx.companyId,
        record.id,
        { ...evaluation, checkOutAt: now },
        ctx.userId,
        tx,
        true,
      );
      if (!updated) throw new ConflictError("You already checked out today.");
      await writeAuditLog(
        ctx,
        {
          action: "attendance.check_out",
          entityType: "AttendanceRecord",
          entityId: record.id,
          before: snapshot(record),
          after: snapshot({ ...record, ...evaluation, checkOutAt: now }),
        },
        tx,
      );
    });
  },

  /** History, newest first. People who see only their own attendance get their records whatever the filter. */
  async list(ctx: TenantContext, query: AttendanceListQuery) {
    authorize(ctx, "attendance:view");
    const days = await presetDays(ctx, query.range);
    let employeeId = query.employeeId;
    if (!seesAll(ctx)) {
      const own = await ownEmployee(ctx);
      if (!own) return { items: [], total: 0, page: query.page, pageSize: query.pageSize, days };
      employeeId = own.id;
    }
    const page = await attendanceRepository.list(ctx.companyId, { ...query, employeeId, days });
    return { ...page, days };
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "attendance:view");
    const record = await attendanceRepository.findById(ctx.companyId, id);
    if (!record) throw new NotFoundError("Attendance record");
    if (!seesAll(ctx)) {
      const own = await ownEmployee(ctx);
      if (own?.id !== record.employeeId) throw new NotFoundError("Attendance record");
    }
    return record;
  },

  /** One employee-day, for HR correcting it (null when nothing is recorded). */
  async findDay(ctx: TenantContext, employeeId: string, date: string) {
    authorize(ctx, "attendance:edit");
    return attendanceRepository.findDay(ctx.companyId, employeeId, date);
  },

  /**
   * HR enters or corrects one employee-day (times in the company time zone). Correcting a day the employee
   * recorded themselves needs a note. The same late / half-day rules apply.
   */
  async saveEntry(ctx: TenantContext, input: AttendanceEntryInput) {
    authorize(ctx, "attendance:edit");
    const [employee, { today, schedule, timeZone }] = await Promise.all([
      employeeRepository.findById(ctx.companyId, input.employeeId),
      clock(ctx),
    ]);
    if (!employee) throw new ValidationError("Choose an employee.", { employeeId: ["Choose an employee."] });
    if (input.date > today)
      throw new ValidationError("The date can't be in the future.", { date: ["In the future."] });
    const span = {
      status: employee.status,
      joiningDate: dateToDateOnly(employee.joiningDate),
      exitDate: employee.exitDate ? dateToDateOnly(employee.exitDate) : null,
    };
    if (span.joiningDate > input.date || (span.exitDate !== null && span.exitDate < input.date)) {
      throw new ValidationError("The employee wasn't employed on that date.", {
        date: ["Outside employment."],
      });
    }
    const existing = await attendanceRepository.findDay(ctx.companyId, employee.id, input.date);
    if (existing?.source === "SELF" && !input.note) {
      throw new ValidationError("Say why the employee's own record is corrected.", {
        note: ["Required for corrections."],
      });
    }
    const data = input.absent
      ? {
          status: "ABSENT" as const,
          checkInAt: null,
          checkOutAt: null,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
          workedMinutes: null,
        }
      : (() => {
          const checkInAt = zonedInstant(input.date, clockMinutes(input.checkIn), timeZone);
          const checkOutAt = input.checkOut
            ? zonedInstant(input.date, clockMinutes(input.checkOut), timeZone)
            : null;
          return { ...evaluateDay(checkInAt, checkOutAt, schedule, timeZone), checkInAt, checkOutAt };
        })();
    return db.$transaction(async (tx) => {
      const values = { ...data, source: "MANUAL" as const, note: input.note || null };
      let id: string;
      if (existing) {
        await attendanceRepository.update(ctx.companyId, existing.id, values, ctx.userId, tx);
        id = existing.id;
      } else {
        id = (
          await attendanceRepository.create(ctx.companyId, employee.id, input.date, values, ctx.userId, tx)
        ).id;
      }
      await writeAuditLog(
        ctx,
        {
          action: existing ? "attendance.correct" : "attendance.record",
          entityType: "AttendanceRecord",
          entityId: id,
          ...(existing ? { before: snapshot(existing) } : {}),
          after: snapshot(values),
          metadata: { employeeId: employee.id, date: input.date, summary: input.note ?? undefined },
        },
        tx,
      );
      return { id };
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "attendance:delete");
    const record = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await attendanceRepository.delete(ctx.companyId, id, tx);
      if (count === 0) throw new NotFoundError("Attendance record");
      await writeAuditLog(
        ctx,
        {
          action: "attendance.delete",
          entityType: "AttendanceRecord",
          entityId: id,
          before: snapshot(record),
          metadata: { employeeId: record.employeeId, date: dateToDateOnly(record.date) },
        },
        tx,
      );
    });
  },

  /** Today's attendance dashboard: counts and every expected employee's status. */
  async today(ctx: TenantContext) {
    assertSeesAll(ctx);
    const { today, schedule } = await clock(ctx);
    const rows: Array<DayVisit & { lateMinutes: number }> = [];
    await eachWorkingDay(ctx, { from: today, to: today }, {}, (day) =>
      rows.push({ ...day, lateMinutes: day.record?.lateMinutes ?? 0 }),
    );
    const count = (test: (row: (typeof rows)[number]) => boolean) => rows.filter(test).length;
    const total = await employeeRepository.countWorkforce(ctx.companyId);
    return {
      today,
      schedule,
      workingDay: isWorkDay(today, schedule.workDays),
      totalEmployees: total,
      present: count((row) => row.status === "PRESENT" || row.status === "LATE" || row.status === "HALF_DAY"),
      late: count((row) => row.lateMinutes > 0),
      absent: count((row) => row.status === "ABSENT" || row.status === "PENDING"),
      onLeave: count((row) => row.status === "ON_LEAVE"),
      rows,
    };
  },

  /** Per-employee totals for a period (working days only, up to today). */
  async report(ctx: TenantContext, query: { range: DateRangePreset; departmentId?: string }) {
    assertSeesAll(ctx);
    const days = await presetDays(ctx, query.range);
    const byEmployee = new Map<string, { employee: DayVisit["employee"]; totals: AttendanceTotals }>();
    const overall = emptyTotals();
    const result = await eachWorkingDay(ctx, days, { departmentId: query.departmentId }, (day) => {
      const entry = byEmployee.get(day.employee.id) ?? { employee: day.employee, totals: emptyTotals() };
      addDay(entry.totals, day.status, day.record);
      addDay(overall, day.status, day.record);
      byEmployee.set(day.employee.id, entry);
    });
    return {
      period: { ...result.days, label: days.label },
      rows: [...byEmployee.values()],
      totals: overall,
      schedule: result.schedule,
    };
  },

  /** One employee's totals over the last 30 days (employee profile). */
  async recentSummary(ctx: TenantContext, employeeId: string) {
    assertSeesAll(ctx);
    const { today } = await clock(ctx);
    const totals = emptyTotals();
    await eachWorkingDay(ctx, { from: addDays(today, -29), to: today }, { employeeId }, (day) =>
      addDay(totals, day.status, day.record),
    );
    return totals;
  },

  /** Present / late / absent / on-leave days per month (dashboard chart). */
  async monthly(ctx: TenantContext, days: DayRange) {
    const months = new Map<string, AttendanceTotals>();
    await eachWorkingDay(ctx, days, {}, (day) => {
      const key = day.date.slice(0, 7);
      const totals = months.get(key) ?? emptyTotals();
      addDay(totals, day.status, day.record);
      months.set(key, totals);
    });
    return months;
  },
};
