import { WEEKDAY_LABELS, type AttendanceStatusKey } from "@/config/hr";
import type { WorkSchedule } from "@/lib/attendance";
import { dateToDateOnly } from "@/lib/date-range";
import { formatCalendarDate, formatTime } from "@/lib/format";
import type { AttendanceRow } from "./attendance-history";
import { formatDuration } from "./labels";

/** Server-side mapping from attendance records to preformatted rows (company locale and time zone). */

interface Format {
  locale: string;
  timeZone: string;
}

export function attendanceRow(
  record: {
    id: string;
    date: Date;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    status: AttendanceStatusKey;
    lateMinutes: number;
    earlyLeaveMinutes: number;
    workedMinutes: number | null;
    source: "SELF" | "MANUAL";
    note: string | null;
    employee: { id: string; name: string };
    updatedBy: { name: string } | null;
  },
  format: Format,
  canCorrect: boolean,
): AttendanceRow {
  return {
    id: record.id,
    date: formatCalendarDate(record.date, format),
    employee: record.employee.name,
    checkIn: record.checkInAt ? formatTime(record.checkInAt, format) : null,
    checkOut: record.checkOutAt ? formatTime(record.checkOutAt, format) : null,
    worked: formatDuration(record.workedMinutes),
    late: record.lateMinutes > 0 ? `${formatDuration(record.lateMinutes)} late` : null,
    early: record.earlyLeaveMinutes > 0 ? `${formatDuration(record.earlyLeaveMinutes)} early` : null,
    status: record.status,
    source: record.source === "SELF" ? "Self" : `HR${record.updatedBy ? ` (${record.updatedBy.name})` : ""}`,
    note: record.note,
    correctHref: canCorrect
      ? `/hr/attendance/new?employeeId=${record.employee.id}&date=${dateToDateOnly(record.date)}`
      : null,
  };
}

/** "Mon–Fri 09:00–17:00 · 10 min grace · half day under 4h 00m". */
export function describeSchedule(schedule: WorkSchedule): string {
  const days = [...schedule.workDays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABELS[day]?.slice(0, 3))
    .join(", ");
  return `${days} ${schedule.start}–${schedule.end} · ${schedule.graceMinutes} min grace · half day under ${formatDuration(schedule.halfDayMinutes)}`;
}
