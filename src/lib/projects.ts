import {
  DUE_SOON_DAYS,
  OPEN_PROJECT_STATUSES,
  type ProjectStatusKey,
  type TaskStatusKey,
} from "@/config/projects";
import { daysBetween } from "@/lib/accounting";

/**
 * Project progress and deadline rules (pure, no database), shared by services, pages and tests. Dates are
 * calendar dates ("YYYY-MM-DD") in the company time zone. See docs/projects.md.
 */

/**
 * Work progress = completed tasks ÷ all tasks, as a whole percentage rounded down (so 100% only when every task
 * is done). Null when the project has no tasks yet. Cancelled/deleted tasks are not counted by the callers.
 */
export function taskProgress(completed: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.floor((Math.min(completed, total) * 100) / total);
}

/**
 * Time progress = share of the planned duration that has passed (0–100, whole percent). Null without both dates.
 * Compared with work progress it shows whether a project is behind schedule.
 */
export function timeProgress(start: string | null, end: string | null, today: string): number | null {
  if (!start || !end) return null;
  const total = daysBetween(start, end);
  if (today <= start) return 0;
  if (today >= end || total <= 0) return 100;
  return Math.floor((daysBetween(start, today) * 100) / total);
}

export type Deadline = "done" | "none" | "overdue" | "due-today" | "due-soon" | "on-track";

/** Deadline state of a task: overdue after its due date, "due soon" within DUE_SOON_DAYS, done when completed. */
export function taskDeadline(dueDate: string | null, status: TaskStatusKey, today: string): Deadline {
  if (status === "COMPLETED") return "done";
  if (!dueDate) return "none";
  const days = daysBetween(today, dueDate);
  if (days < 0) return "overdue";
  if (days === 0) return "due-today";
  if (days <= DUE_SOON_DAYS) return "due-soon";
  return "on-track";
}

/** A project is overdue when it is still open after its end date. */
export function projectOverdue(endDate: string | null, status: ProjectStatusKey, today: string): boolean {
  return endDate !== null && OPEN_PROJECT_STATUSES.includes(status) && endDate < today;
}

/** Days left until `endDate` (negative when past), or null without an end date. */
export function daysLeft(endDate: string | null, today: string): number | null {
  return endDate ? daysBetween(today, endDate) : null;
}

export interface TaskCounts {
  total: number;
  byStatus: Record<TaskStatusKey, number>;
  overdue: number;
}

/** Counts of a list of tasks by status and overdue ones. */
export function countTasks(
  tasks: ReadonlyArray<{ status: TaskStatusKey; dueDate: string | null }>,
  today: string,
): TaskCounts {
  const byStatus: Record<TaskStatusKey, number> = { TODO: 0, IN_PROGRESS: 0, REVIEW: 0, COMPLETED: 0 };
  let overdue = 0;
  for (const task of tasks) {
    byStatus[task.status] += 1;
    if (taskDeadline(task.dueDate, task.status, today) === "overdue") overdue += 1;
  }
  return { total: tasks.length, byStatus, overdue };
}
