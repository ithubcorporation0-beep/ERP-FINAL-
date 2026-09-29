import type { AttendanceStatusKey, DayStatusKey, EmploymentStatusKey } from "@/config/hr";
import { addDays, dateOnlyToDate, zonedParts } from "@/lib/date-range";

/**
 * Attendance rules (pure, no database) shared by services, reports and tests. Times are evaluated in the company
 * time zone against its work schedule (settings `hr.*`). What these rules do and don't cover: docs/hr.md.
 */

export interface WorkSchedule {
  /** "HH:MM" */
  start: string;
  /** "HH:MM", after `start` (overnight shifts aren't supported). */
  end: string;
  /** Minutes after `start` before a check-in counts as late. */
  graceMinutes: number;
  /** Fewer worked minutes than this makes the day a half day. */
  halfDayMinutes: number;
  /** 0 = Sunday … 6 = Saturday. */
  workDays: readonly number[];
}

export interface DayEvaluation {
  status: Exclude<AttendanceStatusKey, "ABSENT">;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  /** Null while the employee hasn't checked out. */
  workedMinutes: number | null;
}

/** "09:30" → 570. */
export function clockMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 570 → "09:30". */
export function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Calendar date ("YYYY-MM-DD") and minutes since local midnight of an instant in `timeZone`. */
export function localClock(instant: Date, timeZone: string): { date: string; minutes: number } {
  const parts = zonedParts(instant, timeZone);
  const date = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  return { date, minutes: parts.hour * 60 + parts.minute };
}

/**
 * Status of a day with a check-in:
 * - late: checked in more than `graceMinutes` after the start → lateMinutes counted from the start;
 * - early departure: checked out before the end (same day) → earlyLeaveMinutes;
 * - half day: checked out having worked fewer than `halfDayMinutes`;
 * - status priority: HALF_DAY, then LATE, else PRESENT.
 */
export function evaluateDay(
  checkIn: Date,
  checkOut: Date | null,
  schedule: WorkSchedule,
  timeZone: string,
): DayEvaluation {
  const start = clockMinutes(schedule.start);
  const end = clockMinutes(schedule.end);
  const arrival = localClock(checkIn, timeZone);
  const lateMinutes = arrival.minutes > start + schedule.graceMinutes ? arrival.minutes - start : 0;
  let earlyLeaveMinutes = 0;
  let workedMinutes: number | null = null;
  if (checkOut) {
    const departure = localClock(checkOut, timeZone);
    if (departure.date === arrival.date && departure.minutes < end)
      earlyLeaveMinutes = end - departure.minutes;
    workedMinutes = Math.max(0, Math.floor((checkOut.getTime() - checkIn.getTime()) / 60_000));
  }
  const status =
    workedMinutes !== null && workedMinutes < schedule.halfDayMinutes
      ? "HALF_DAY"
      : lateMinutes > 0
        ? "LATE"
        : "PRESENT";
  return { status, lateMinutes, earlyLeaveMinutes, workedMinutes };
}

/** Day of the week of a calendar date (0 = Sunday). */
export function weekday(date: string): number {
  return dateOnlyToDate(date).getUTCDay();
}

export function isWorkDay(date: string, workDays: readonly number[]): boolean {
  return workDays.includes(weekday(date));
}

/** Working days from `from` to `to`, both included. */
export function workingDays(from: string, to: string, workDays: readonly number[]): string[] {
  const days: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (isWorkDay(date, workDays)) days.push(date);
  }
  return days;
}

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(a: { start: string; end: string }, b: { start: string; end: string }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export interface EmploymentSpan {
  status: EmploymentStatusKey;
  joiningDate: string;
  exitDate: string | null;
}

/** Whether attendance is expected from this employee on `date` (joined, not yet left, not suspended). */
export function employedOn(employee: EmploymentSpan, date: string): boolean {
  if (employee.status === "SUSPENDED") return false;
  if (employee.joiningDate > date) return false;
  if (employee.exitDate !== null && employee.exitDate < date) return false;
  if ((employee.status === "RESIGNED" || employee.status === "TERMINATED") && employee.exitDate === null)
    return false;
  return true;
}

/**
 * Outcome of one working day. A stored record wins; otherwise approved leave → ON_LEAVE; otherwise the day is
 * ABSENT once it is over (a past date, or today after the end of the working day), else PENDING.
 */
export function dayStatus(input: {
  record: { status: AttendanceStatusKey } | null;
  onLeave: boolean;
  date: string;
  today: string;
  nowMinutes: number;
  schedule: WorkSchedule;
}): DayStatusKey {
  if (input.record) return input.record.status;
  if (input.onLeave) return "ON_LEAVE";
  const over =
    input.date < input.today ||
    (input.date === input.today && input.nowMinutes >= clockMinutes(input.schedule.end));
  return over ? "ABSENT" : "PENDING";
}

export interface AttendanceTotals {
  workingDays: number;
  present: number;
  late: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  pending: number;
  earlyDepartures: number;
  workedMinutes: number;
}

export function emptyTotals(): AttendanceTotals {
  return {
    workingDays: 0,
    present: 0,
    late: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    pending: 0,
    earlyDepartures: 0,
    workedMinutes: 0,
  };
}

/**
 * Adds one working day to the totals. "present" counts every day the employee came in (on time, late or half day);
 * "late" (arrived after the grace period, even on a half day) and "halfDay" are subsets of it.
 */
export function addDay(
  totals: AttendanceTotals,
  status: DayStatusKey,
  record: { lateMinutes: number; earlyLeaveMinutes: number; workedMinutes: number | null } | null,
): void {
  totals.workingDays += 1;
  if (status === "PRESENT" || status === "LATE" || status === "HALF_DAY") totals.present += 1;
  if (record && record.lateMinutes > 0) totals.late += 1;
  if (status === "HALF_DAY") totals.halfDay += 1;
  if (status === "ABSENT") totals.absent += 1;
  if (status === "ON_LEAVE") totals.onLeave += 1;
  if (status === "PENDING") totals.pending += 1;
  if (record && record.earlyLeaveMinutes > 0) totals.earlyDepartures += 1;
  totals.workedMinutes += record?.workedMinutes ?? 0;
}
