import { describe, expect, it } from "vitest";
import { PROJECT_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from "@/config/projects";
import { formatRecordNumber, parseRecordNumber } from "@/config/records";
import { daysLeftLabel } from "@/features/projects/rows";
import { ProjectStatus, TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import {
  countTasks,
  daysLeft,
  projectOverdue,
  taskDeadline,
  taskProgress,
  timeProgress,
} from "@/lib/projects";
import { projectListQuerySchema, projectSchema, taskListQuerySchema, taskSchema } from "@/lib/validation";

const sorted = (values: readonly string[]) => [...values].sort();
const PROJECT_ID = "0199a8f4-6b2e-7c3d-8e4f-5a6b7c8d9e0f";

describe("projects vocabulary", () => {
  it("matches the database enums", () => {
    expect(sorted(PROJECT_STATUSES)).toEqual(sorted(Object.values(ProjectStatus)));
    expect(sorted(TASK_PRIORITIES)).toEqual(sorted(Object.values(TaskPriority)));
    expect(sorted(TASK_STATUSES)).toEqual(sorted(Object.values(TaskStatus)));
  });

  it("formats and parses project and task IDs", () => {
    expect(formatRecordNumber("project", 7)).toBe("PRJ-0007");
    expect(formatRecordNumber("task", 123)).toBe("TSK-0123");
    expect(parseRecordNumber("task", "tsk-12")).toBe(12);
    expect(parseRecordNumber("project", "PRJ-0003")).toBe(3);
  });
});

describe("progress", () => {
  it("work progress is completed ÷ total, rounded down, null without tasks", () => {
    expect(taskProgress(0, 0)).toBeNull();
    expect(taskProgress(0, 4)).toBe(0);
    expect(taskProgress(1, 3)).toBe(33);
    expect(taskProgress(2, 3)).toBe(66);
    // 100% only when every task is done.
    expect(taskProgress(199, 200)).toBe(99);
    expect(taskProgress(5, 5)).toBe(100);
  });

  it("time progress is the share of the planned duration that has passed", () => {
    expect(timeProgress(null, "2026-10-31", "2026-10-01")).toBeNull();
    expect(timeProgress("2026-10-01", null, "2026-10-01")).toBeNull();
    expect(timeProgress("2026-10-01", "2026-10-31", "2026-09-20")).toBe(0);
    expect(timeProgress("2026-10-01", "2026-10-31", "2026-10-16")).toBe(50);
    expect(timeProgress("2026-10-01", "2026-10-31", "2026-11-05")).toBe(100);
    // Single-day project.
    expect(timeProgress("2026-10-01", "2026-10-01", "2026-10-01")).toBe(0);
    expect(timeProgress("2026-10-01", "2026-10-01", "2026-10-02")).toBe(100);
  });

  it("an open project is overdue after its end date; closed ones never are", () => {
    expect(projectOverdue("2026-09-30", "ACTIVE", "2026-10-01")).toBe(true);
    expect(projectOverdue("2026-10-01", "ACTIVE", "2026-10-01")).toBe(false);
    expect(projectOverdue("2026-09-30", "ON_HOLD", "2026-10-01")).toBe(true);
    expect(projectOverdue("2026-09-30", "COMPLETED", "2026-10-01")).toBe(false);
    expect(projectOverdue("2026-09-30", "CANCELLED", "2026-10-01")).toBe(false);
    expect(projectOverdue(null, "ACTIVE", "2026-10-01")).toBe(false);
  });

  it("days left and their wording", () => {
    expect(daysLeft("2026-10-11", "2026-10-01")).toBe(10);
    expect(daysLeft("2026-09-29", "2026-10-01")).toBe(-2);
    expect(daysLeft(null, "2026-10-01")).toBeNull();
    expect(daysLeftLabel(1)).toBe("1 day left");
    expect(daysLeftLabel(0)).toBe("Ends today");
    expect(daysLeftLabel(-3)).toBe("3 days late");
    expect(daysLeftLabel(null)).toBeNull();
  });
});

describe("deadlines", () => {
  const today = "2026-10-01";

  it("classifies due dates", () => {
    expect(taskDeadline("2026-09-30", "IN_PROGRESS", today)).toBe("overdue");
    expect(taskDeadline(today, "TODO", today)).toBe("due-today");
    expect(taskDeadline("2026-10-04", "REVIEW", today)).toBe("due-soon");
    expect(taskDeadline("2026-10-05", "TODO", today)).toBe("on-track");
    expect(taskDeadline(null, "TODO", today)).toBe("none");
    // A completed task is never overdue.
    expect(taskDeadline("2026-09-01", "COMPLETED", today)).toBe("done");
  });

  it("counts tasks by status and overdue ones", () => {
    expect(
      countTasks(
        [
          { status: "TODO", dueDate: "2026-09-29" },
          { status: "TODO", dueDate: null },
          { status: "IN_PROGRESS", dueDate: today },
          { status: "COMPLETED", dueDate: "2026-09-01" },
        ],
        today,
      ),
    ).toEqual({ total: 4, overdue: 1, byStatus: { TODO: 2, IN_PROGRESS: 1, REVIEW: 0, COMPLETED: 1 } });
  });
});

describe("validation", () => {
  it("accepts a project with only a name and status, and exact budgets", () => {
    expect(projectSchema.parse({ name: "Relaunch", status: "PLANNING" })).toMatchObject({ name: "Relaunch" });
    expect(projectSchema.parse({ name: "Relaunch", status: "ACTIVE", budget: "1250000.50" }).budget).toBe(
      "1250000.50",
    );
  });

  it("refuses bad project input", () => {
    const bad = (input: Record<string, unknown>) =>
      projectSchema.safeParse({ name: "Relaunch", status: "ACTIVE", ...input }).success;
    expect(bad({ name: "X" })).toBe(false);
    expect(bad({ status: "DONE" })).toBe(false);
    expect(bad({ budget: "-5" })).toBe(false);
    expect(bad({ budget: "10.005" })).toBe(false);
    expect(bad({ startDate: "2026-10-10", endDate: "2026-10-09" })).toBe(false);
    expect(bad({ customerId: "not-an-id" })).toBe(false);
  });

  it("validates tasks", () => {
    const task = (input: Record<string, unknown>) =>
      taskSchema.safeParse({
        name: "Write copy",
        projectId: PROJECT_ID,
        priority: "HIGH",
        status: "TODO",
        ...input,
      });
    expect(task({}).success).toBe(true);
    expect(task({ projectId: "" }).error?.issues[0]?.message).toBe("Choose a project.");
    expect(task({ priority: "CRITICAL" }).success).toBe(false);
    expect(task({ status: "DONE" }).success).toBe(false);
    expect(task({ startDate: "2026-10-10", dueDate: "2026-10-01" }).success).toBe(false);
    expect(task({ startDate: "2026-10-01", dueDate: "2026-10-01" }).success).toBe(true);
  });

  it("ignores unknown list filters from a hand-edited URL", () => {
    expect(projectListQuerySchema.parse({ status: "whatever" }).status).toBeUndefined();
    expect(projectListQuerySchema.parse({ status: "open" }).status).toBe("open");
    const query = taskListQuerySchema.parse({
      status: "nope",
      due: "later",
      mine: "yes",
      priority: "URGENT",
    });
    expect(query).toMatchObject({ status: undefined, due: undefined, mine: undefined, priority: "URGENT" });
  });
});
