import {
  OPEN_PROJECT_STATUSES,
  type ProjectStatusKey,
  type TaskPriorityKey,
  type TaskStatusKey,
} from "@/config/projects";
import { formatRecordNumber } from "@/config/records";
import { dateToDateOnly } from "@/lib/date-range";
import { formatCalendarDate, formatMoney, type CompanyFormat } from "@/lib/format";
import { taskDeadline, type Deadline, type TaskCounts } from "@/lib/projects";

/**
 * Plain, serializable rows for the project and task lists and the board, built on the server from repository
 * records (dates formatted in the company locale, money as exact decimal strings).
 */

interface ProjectRecord {
  id: string;
  number: number;
  name: string;
  status: ProjectStatusKey;
  startDate: Date | null;
  endDate: Date | null;
  budget: { toString(): string } | null;
  customer: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
  progress: {
    counts: TaskCounts;
    work: number | null;
    time: number | null;
    daysLeft: number | null;
    overdue: boolean;
  };
}

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  status: ProjectStatusKey;
  customerName: string | null;
  managerName: string | null;
  startLabel: string | null;
  endLabel: string | null;
  budgetLabel: string | null;
  work: number | null;
  time: number | null;
  overdue: boolean;
  daysLeft: number | null;
  tasksDone: number;
  tasksTotal: number;
  tasksOverdue: number;
}

export function toProjectRow(project: ProjectRecord, format: CompanyFormat): ProjectRow {
  return {
    id: project.id,
    code: formatRecordNumber("project", project.number),
    name: project.name,
    status: project.status,
    customerName: project.customer?.name ?? null,
    managerName: project.manager?.name ?? null,
    startLabel: project.startDate ? formatCalendarDate(project.startDate, format) : null,
    endLabel: project.endDate ? formatCalendarDate(project.endDate, format) : null,
    budgetLabel: formatMoney(project.budget, format),
    work: project.progress.work,
    time: project.progress.time,
    overdue: project.progress.overdue,
    daysLeft: project.progress.daysLeft,
    tasksDone: project.progress.counts.byStatus.COMPLETED,
    tasksTotal: project.progress.counts.total,
    tasksOverdue: project.progress.counts.overdue,
  };
}

/** "12 days left", "Ends today", "3 days late". */
export function daysLeftLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "Ends today";
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} left`;
  return `${-days} ${days === -1 ? "day" : "days"} late`;
}

interface TaskRecord {
  id: string;
  number: number;
  name: string;
  priority: TaskPriorityKey;
  status: TaskStatusKey;
  startDate: Date | null;
  dueDate: Date | null;
  project: { id: string; number: number; name: string; status: ProjectStatusKey };
  assignee: { id: string; name: string } | null;
  _count: { attachments: number };
}

export interface TaskRow {
  id: string;
  code: string;
  name: string;
  status: TaskStatusKey;
  priority: TaskPriorityKey;
  projectId: string;
  projectName: string;
  projectCode: string;
  /** The project is completed or cancelled: the task can't change. */
  locked: boolean;
  assigneeName: string | null;
  startLabel: string | null;
  dueLabel: string | null;
  deadline: Deadline;
  attachments: number;
}

export function toTaskRow(task: TaskRecord, format: CompanyFormat, today: string): TaskRow {
  return {
    id: task.id,
    code: formatRecordNumber("task", task.number),
    name: task.name,
    status: task.status,
    priority: task.priority,
    projectId: task.project.id,
    projectName: task.project.name,
    projectCode: formatRecordNumber("project", task.project.number),
    locked: !OPEN_PROJECT_STATUSES.includes(task.project.status),
    assigneeName: task.assignee?.name ?? null,
    startLabel: task.startDate ? formatCalendarDate(task.startDate, format) : null,
    dueLabel: task.dueDate ? formatCalendarDate(task.dueDate, format) : null,
    deadline: taskDeadline(task.dueDate ? dateToDateOnly(task.dueDate) : null, task.status, today),
    attachments: task._count.attachments,
  };
}
