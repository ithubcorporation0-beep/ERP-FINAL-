/**
 * HR vocabulary shared by validation, server and UI. Value lists mirror the Prisma enums (checked by
 * tests/unit/hr.test.ts) but live here so browser code never imports the Prisma client. Rules: docs/hr.md.
 */

export const EMPLOYMENT_STATUSES = [
  "PROBATION",
  "ACTIVE",
  "ON_NOTICE",
  "SUSPENDED",
  "RESIGNED",
  "TERMINATED",
] as const;
export type EmploymentStatusKey = (typeof EMPLOYMENT_STATUSES)[number];
export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatusKey, string> = {
  PROBATION: "Probation",
  ACTIVE: "Active",
  ON_NOTICE: "On notice",
  SUSPENDED: "Suspended",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
};
/** Statuses that end employment; they need an exit date. */
export const EXIT_STATUSES: readonly EmploymentStatusKey[] = ["RESIGNED", "TERMINATED"];
/** Statuses expected at work (counted in attendance and "Total employees"). */
export const WORKFORCE_STATUSES: readonly EmploymentStatusKey[] = ["PROBATION", "ACTIVE", "ON_NOTICE"];

export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "HALF_DAY", "ABSENT"] as const;
export type AttendanceStatusKey = (typeof ATTENDANCE_STATUSES)[number];

/** A working day's outcome in reports: a stored status, or derived (on leave, absent, not checked in yet). */
export const DAY_STATUSES = ["PRESENT", "LATE", "HALF_DAY", "ABSENT", "ON_LEAVE", "PENDING"] as const;
export type DayStatusKey = (typeof DAY_STATUSES)[number];
export const DAY_STATUS_LABELS: Record<DayStatusKey, string> = {
  PRESENT: "Present",
  LATE: "Late",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  PENDING: "Not checked in yet",
};

export const LEAVE_TYPES = ["ANNUAL", "SICK", "CASUAL", "UNPAID", "MATERNITY", "PATERNITY", "OTHER"] as const;
export type LeaveTypeKey = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_LABELS: Record<LeaveTypeKey, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick leave",
  CASUAL: "Casual leave",
  UNPAID: "Unpaid leave",
  MATERNITY: "Maternity leave",
  PATERNITY: "Paternity leave",
  OTHER: "Other",
};

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type LeaveStatusKey = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatusKey, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
