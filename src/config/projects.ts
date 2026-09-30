/**
 * Projects and tasks vocabulary shared by validation, server and UI. Value lists mirror the Prisma enums (checked
 * by tests/unit/projects.test.ts) but live here so browser code never imports the Prisma client.
 */

export const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type ProjectStatusKey = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatusKey, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
/** Projects still being worked on (deadlines and "overdue" apply). */
export const OPEN_PROJECT_STATUSES: readonly ProjectStatusKey[] = ["PLANNING", "ACTIVE", "ON_HOLD"];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriorityKey = (typeof TASK_PRIORITIES)[number];
export const TASK_PRIORITY_LABELS: Record<TaskPriorityKey, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"] as const;
export type TaskStatusKey = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatusKey, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  REVIEW: "Review",
  COMPLETED: "Completed",
};

/** Tasks due within this many days (and not done) are "due soon". */
export const DUE_SOON_DAYS = 3;
