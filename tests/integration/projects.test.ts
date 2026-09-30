import { describe, expect, it } from "vitest";
import { addDays, todayInZone } from "@/lib/date-range";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import { projectListQuerySchema, projectSchema, taskListQuerySchema, taskSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";
import { dashboardService } from "@/server/services/dashboard.service";
import { employeeService } from "@/server/services/employee.service";
import { projectService } from "@/server/services/project.service";
import { taskService } from "@/server/services/task.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const today = () => todayInZone("UTC");

function project(overrides: Record<string, unknown> = {}) {
  return projectSchema.parse({
    name: "Website relaunch",
    status: "ACTIVE",
    startDate: addDays(today(), -10),
    endDate: addDays(today(), 20),
    budget: "250000.50",
    ...overrides,
  });
}

function task(projectId: string, overrides: Record<string, unknown> = {}) {
  return taskSchema.parse({
    name: "Design homepage",
    projectId,
    priority: "MEDIUM",
    status: "TODO",
    ...overrides,
  });
}

/** A member with a built-in role linked to an employee record. */
async function linkedMember(owner: TenantContext, role: string, name: string) {
  const { ctx } = await addMember(owner, role);
  const employee = await employeeService.create(owner, {
    name,
    joiningDate: "2025-01-01",
    userId: ctx.userId,
  });
  return { ctx, employee };
}

describe("projects", () => {
  it("creates numbered projects for a customer and manager, validates them, and tracks progress", async () => {
    const owner = await createCompanyWithOwner("Projects Co");
    const customer = await customerService.create(owner, { name: "Acme" });
    const manager = await employeeService.create(owner, { name: "Maya Manager", joiningDate: "2025-01-01" });
    const created = await projectService.create(
      owner,
      project({ customerId: customer.id, managerId: manager.id }),
    );
    expect(created).toMatchObject({ number: 1, status: "ACTIVE" });
    expect(created.budget?.toString()).toBe("250000.5");

    expect(() => project({ startDate: "2026-05-10", endDate: "2026-05-01" })).toThrow(
      /before the start date/,
    );
    const other = await createCompanyWithOwner("Other Projects Co");
    const foreignCustomer = await customerService.create(other, { name: "Not yours" });
    await expect(
      projectService.create(owner, project({ customerId: foreignCustomer.id })),
    ).rejects.toBeInstanceOf(ValidationError);

    // Progress: 1 of 4 tasks completed = 25%; one overdue task.
    for (const [name, status, due] of [
      ["Task A", "COMPLETED", null],
      ["Task B", "IN_PROGRESS", addDays(today(), -1)],
      ["Task C", "TODO", addDays(today(), 2)],
      ["Task D", "REVIEW", null],
    ] as const) {
      await taskService.create(owner, task(created.id, { name, status, dueDate: due ?? "" }));
    }
    const detail = await projectService.detail(owner, created.id);
    expect(detail.progress).toMatchObject({
      work: 25,
      time: 33, // 10 of 30 days
      daysLeft: 20,
      overdue: false,
      counts: { total: 4, overdue: 1, byStatus: { TODO: 1, IN_PROGRESS: 1, REVIEW: 1, COMPLETED: 1 } },
    });

    // Completing sets completedAt (also required by the database); a project with tasks can't be deleted.
    await projectService.update(owner, created.id, project({ status: "COMPLETED", customerId: customer.id }));
    expect((await projectService.get(owner, created.id)).completedAt).not.toBeNull();
    await expect(
      rawDb.project.update({ where: { id: created.id }, data: { completedAt: null } }),
    ).rejects.toThrow(/projects_completed_at_matches_status/);
    await expect(projectService.remove(owner, created.id)).rejects.toBeInstanceOf(ConflictError);
    const empty = await projectService.create(owner, project({ name: "Empty" }));
    await projectService.remove(owner, empty.id);
    await expect(projectService.get(owner, empty.id)).rejects.toBeInstanceOf(NotFoundError);

    const history = await projectService.history(owner, created.id);
    expect(history.map((entry) => entry.label)).toEqual(["Updated", "Created"]);
    expect(history[0]?.detail).toContain("Active → Completed");
  });
});

describe("tasks", () => {
  it("assigns tasks, moves them through the statuses and keeps attachments", async () => {
    const owner = await createCompanyWithOwner("Tasks Co");
    const { ctx: worker, employee } = await linkedMember(owner, "Employee", "Wendy Worker");
    const { ctx: stranger } = await linkedMember(owner, "Employee", "Sam Stranger");
    const created = await projectService.create(owner, project());
    const mine = await taskService.create(
      owner,
      task(created.id, { assigneeId: employee.id, priority: "URGENT" }),
    );
    const other = await taskService.create(owner, task(created.id, { name: "Someone else's" }));
    expect([mine.number, other.number]).toEqual([1, 2]);

    // The employee sees their task and its project, not the other task; strangers see neither.
    expect(
      (await taskService.list(worker, taskListQuerySchema.parse({}))).items.map((item) => item.id),
    ).toEqual([mine.id]);
    await expect(taskService.get(worker, other.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await projectService.list(worker, projectListQuerySchema.parse({}))).total).toBe(1);
    await expect(taskService.get(stranger, mine.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(projectService.get(stranger, created.id)).rejects.toBeInstanceOf(NotFoundError);

    // The employee moves their own task, but can't edit, reassign, create or delete tasks.
    await taskService.setStatus(worker, mine.id, "IN_PROGRESS");
    await taskService.setStatus(worker, mine.id, "COMPLETED");
    expect((await taskService.get(owner, mine.id)).completedAt).not.toBeNull();
    await taskService.setStatus(worker, mine.id, "REVIEW");
    expect((await taskService.get(owner, mine.id)).completedAt).toBeNull();
    await expect(
      taskService.update(worker, mine.id, task(created.id, { name: "Hacked" })),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taskService.assign(worker, mine.id, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taskService.create(worker, task(created.id))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(taskService.remove(worker, mine.id)).rejects.toBeInstanceOf(ForbiddenError);

    // Attachments.
    const attachment = await taskService.uploadAttachment(worker, mine.id, {
      name: "spec.pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 spec"),
    });
    expect(attachment.storageKey.startsWith(`companies/${owner.companyId}/tasks/${mine.id}/`)).toBe(true);
    expect((await taskService.downloadAttachment(owner, mine.id, attachment.id)).attachment.name).toBe(
      "spec.pdf",
    );
    const ownersFile = await taskService.uploadAttachment(owner, mine.id, {
      name: "notes.txt",
      bytes: new TextEncoder().encode("owner notes"),
    });
    await expect(taskService.removeAttachment(worker, mine.id, ownersFile.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await taskService.removeAttachment(worker, mine.id, attachment.id);

    // Reassigning moves the task out of the employee's view.
    await taskService.assign(owner, mine.id, null);
    await expect(taskService.get(worker, mine.id)).rejects.toBeInstanceOf(NotFoundError);

    // Tasks of a cancelled project are frozen.
    await projectService.update(owner, created.id, project({ status: "CANCELLED" }));
    await expect(taskService.setStatus(owner, other.id, "IN_PROGRESS")).rejects.toBeInstanceOf(ConflictError);
    await expect(taskService.create(owner, task(created.id))).rejects.toBeInstanceOf(ValidationError);

    const history = await taskService.history(owner, mine.id);
    expect(history.map((entry) => entry.label)).toEqual([
      "Assigned",
      "Attachment deleted",
      "Attachment added",
      "Attachment added",
      "Status changed",
      "Status changed",
      "Status changed",
      "Created",
    ]);
  });

  it("detects stale moves and keeps the board and dashboard scoped", async () => {
    const owner = await createCompanyWithOwner("Board Co");
    const { ctx: worker, employee } = await linkedMember(owner, "Employee", "Bo Board");
    const created = await projectService.create(owner, project());
    const card = await taskService.create(owner, task(created.id, { assigneeId: employee.id }));
    await taskService.create(owner, task(created.id, { name: "Not Bo's" }));

    // A second, stale move of the same card is refused instead of silently overwriting.
    const [first, second] = await Promise.allSettled([
      taskService.setStatus(owner, card.id, "IN_PROGRESS"),
      taskService.setStatus(worker, card.id, "REVIEW"),
    ]);
    expect(
      [first.status, second.status].filter((status) => status === "fulfilled").length,
    ).toBeGreaterThanOrEqual(1);

    expect((await taskService.board(worker, {})).map((item) => item.id)).toEqual([card.id]);
    expect(await taskService.board(owner, {})).toHaveLength(2);

    const scope = await dashboardService.scope(worker, "this-month");
    const kpis = await dashboardService.kpis(scope);
    expect(kpis.find((kpi) => kpi.id === "pendingTasks")?.state).toMatchObject({ data: { value: "1" } });
    expect(kpis.find((kpi) => kpi.id === "activeProjects")?.state).toMatchObject({ data: { value: "1" } });
    const ownerKpis = await dashboardService.kpis(await dashboardService.scope(owner, "this-month"));
    expect(ownerKpis.find((kpi) => kpi.id === "pendingTasks")?.state).toMatchObject({ data: { value: "2" } });

    const report = await projectService.report(owner);
    expect(report.workload.map((row) => [row.name, row.open])).toEqual([
      ["Bo Board", 1],
      ["Unassigned", 1],
    ]);
  });
});

describe("projects isolation", () => {
  it("never shows or changes another company's projects, tasks or attachments", async () => {
    const ownerA = await createCompanyWithOwner("Proj A");
    const ownerB = await createCompanyWithOwner("Proj B");
    const projectA = await projectService.create(ownerA, project());
    const taskA = await taskService.create(ownerA, task(projectA.id));
    const employeeB = await employeeService.create(ownerB, { name: "B worker", joiningDate: "2025-01-01" });

    await expect(projectService.get(ownerB, projectA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(taskService.get(ownerB, taskA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(taskService.setStatus(ownerB, taskA.id, "COMPLETED")).rejects.toBeInstanceOf(NotFoundError);
    await expect(taskService.create(ownerB, task(projectA.id))).rejects.toBeInstanceOf(ValidationError);
    // A can't assign its task to B's employee.
    await expect(taskService.assign(ownerA, taskA.id, employeeB.id)).rejects.toBeInstanceOf(ValidationError);
    expect((await taskService.list(ownerB, taskListQuerySchema.parse({}))).total).toBe(0);
  });
});
