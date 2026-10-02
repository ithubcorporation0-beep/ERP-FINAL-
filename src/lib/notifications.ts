import { daysBetween } from "@/lib/accounting";

/**
 * Notification rules (pure, no database), shared by the service and the tests. See docs/notifications.md.
 */

export interface Channels {
  inApp: boolean;
  email: boolean;
}

/** The channels a user gets for a type: their saved choice, otherwise the type's defaults. */
export function resolveChannels(defaults: Channels, saved: Channels | undefined): Channels {
  return saved ? { inApp: saved.inApp, email: saved.email } : { ...defaults };
}

/** Delay before retry number `attempts` (1-based) of a failed email: 1, 5, 25, 125 minutes… capped at 12 hours. */
export function retryDelayMinutes(attempts: number): number {
  return Math.min(5 ** Math.max(0, attempts - 1), 12 * 60);
}

export type DeadlineStage = "upcoming" | "overdue";

/**
 * Which reminder applies to a deadline: "upcoming" from `reminderDays` before the date up to the date itself,
 * "overdue" after it, otherwise none. Dates are "YYYY-MM-DD" in the company's time zone.
 */
export function deadlineStage(deadline: string, today: string, reminderDays: number): DeadlineStage | null {
  const days = daysBetween(today, deadline);
  if (days < 0) return "overdue";
  if (days <= reminderDays) return "upcoming";
  return null;
}

/**
 * The dedupe key of a once-per-event notification. The deadline date is part of deadline keys, so moving a due
 * date produces a new reminder, and each stage (upcoming, overdue) is sent once.
 */
export function dedupeKey(type: string, entityId: string, ...parts: string[]): string {
  return [type, entityId, ...parts].join(":");
}

/** "Due in 2 days", "Due today", "Due tomorrow", "3 days overdue". */
export function deadlineLabel(deadline: string, today: string): string {
  const days = daysBetween(today, deadline);
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days > 1) return `due in ${days} days`;
  return days === -1 ? "1 day overdue" : `${-days} days overdue`;
}
