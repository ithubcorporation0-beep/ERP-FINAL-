import type { StatusTone } from "@/components/shared/status-badge";
import type { DayStatusKey, EmploymentStatusKey, LeaveStatusKey } from "@/config/hr";

export const EMPLOYMENT_STATUS_TONES: Record<EmploymentStatusKey, StatusTone> = {
  PROBATION: "info",
  ACTIVE: "success",
  ON_NOTICE: "warning",
  SUSPENDED: "danger",
  RESIGNED: "neutral",
  TERMINATED: "neutral",
};

export const DAY_STATUS_TONES: Record<DayStatusKey, StatusTone> = {
  PRESENT: "success",
  LATE: "warning",
  HALF_DAY: "warning",
  ABSENT: "danger",
  ON_LEAVE: "info",
  PENDING: "neutral",
};

export const LEAVE_STATUS_TONES: Record<LeaveStatusKey, StatusTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

/** "7h 30m" from minutes. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${String(minutes % 60).padStart(2, "0")}m` : `${minutes}m`;
}
