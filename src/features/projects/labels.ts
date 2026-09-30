import type { StatusTone } from "@/components/shared/status-badge";
import type { ProjectStatusKey, TaskPriorityKey, TaskStatusKey } from "@/config/projects";
import type { Deadline } from "@/lib/projects";

export const PROJECT_STATUS_TONES: Record<ProjectStatusKey, StatusTone> = {
  PLANNING: "info",
  ACTIVE: "success",
  ON_HOLD: "warning",
  COMPLETED: "neutral",
  CANCELLED: "danger",
};

export const TASK_STATUS_TONES: Record<TaskStatusKey, StatusTone> = {
  TODO: "neutral",
  IN_PROGRESS: "info",
  REVIEW: "warning",
  COMPLETED: "success",
};

export const TASK_PRIORITY_TONES: Record<TaskPriorityKey, StatusTone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export const DEADLINE_LABELS: Record<Deadline, string> = {
  done: "Done",
  none: "No due date",
  overdue: "Overdue",
  "due-today": "Due today",
  "due-soon": "Due soon",
  "on-track": "On track",
};

export const DEADLINE_TONES: Record<Deadline, StatusTone> = {
  done: "success",
  none: "neutral",
  overdue: "danger",
  "due-today": "warning",
  "due-soon": "warning",
  "on-track": "neutral",
};

/** Deadlines worth calling out next to a due date. */
export function isUrgentDeadline(deadline: Deadline): boolean {
  return deadline === "overdue" || deadline === "due-today" || deadline === "due-soon";
}
