import "server-only";
import { WORKFORCE_STATUSES } from "@/config/hr";
import { OPEN_PROJECT_STATUSES, TASK_STATUS_LABELS, type TaskStatusKey } from "@/config/projects";
import { formatRecordNumber } from "@/config/records";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { companyKey } from "@/lib/storage";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { TaskInput, TaskListQuery } from "@/lib/validation";
import { employeeRepository } from "@/server/repositories/employee.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { projectRepository } from "@/server/repositories/project.repository";
import { taskAttachmentRepository } from "@/server/repositories/task-attachment.repository";
import { taskRepository, type TaskScope } from "@/server/repositories/task.repository";
import { writeAuditLog } from "./audit.service";
import { ownEmployee } from "./hr-shared";
import { projectScope } from "./project.service";
import { recordHistory, snapshotText } from "./record-history";
import { salesContext } from "./sales-shared";
import {
  checkDocument,
  deleteStoredQuietly,
  readStored,
  storeThenRecord,
  type UploadedFile,
} from "./stored-files";

/**
 * Tasks (`TSK-0001`) and their attachments.
 * - `tasks:view` to read. People with `tasks:create` or `projects:edit` ("task managers") see and manage every
 *   task; everyone else sees tasks assigned to them or in projects they manage (through their employee record).
 * - `tasks:create` adds tasks; `tasks:edit` edits and assigns (task managers) or moves the status and adds
 *   attachments of the tasks you can see (e.g. an employee moving their own task); `tasks:delete` deletes.
 * - Tasks of completed or cancelled projects can't change until the project is reopened.
 */

type Task = NonNullable<Awaited<ReturnType<typeof taskRepository.findById>>>;

export function managesTasks(ctx: TenantContext): boolean {
  return can(ctx, "tasks:create") || can(ctx, "projects:edit");
}

export async function taskScope(ctx: TenantContext): Promise<TaskScope | null> {
  if (managesTasks(ctx)) return {};
  const own = await ownEmployee(ctx);
  return own ? { employeeId: own.id } : null;
}

function snapshot(task: Task) {
  return {
    code: formatRecordNumber("task", task.number),
    name: task.name,
    projectId: task.projectId,
    assigneeId: task.assigneeId,
    priority: task.priority,
    status: task.status,
    startDate: task.startDate ? dateToDateOnly(task.startDate) : null,
    dueDate: task.dueDate ? dateToDateOnly(task.dueDate) : null,
    description: task.description,
  };
}

function assertProjectOpen(task: { project: { status: string } }) {
  if (!OPEN_PROJECT_STATUSES.some((status) => status === task.project.status)) {
    throw new ConflictError("The project is completed or cancelled. Reopen it to change its tasks.");
  }
}

const HISTORY_ACTIONS: Record<string, string> = {
  "task.create": "Created",
  "task.update": "Updated",
  "task.status": "Status changed",
  "task.assign": "Assigned",
  "task.attachment_upload": "Attachment added",
  "task.attachment_delete": "Attachment deleted",
  "task.delete": "Deleted",
};

export const taskService = {
  managesTasks,

  async list(ctx: TenantContext, query: TaskListQuery) {
    authorize(ctx, "tasks:view");
    const scope = await taskScope(ctx);
    if (!scope) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    const { today } = await salesContext(ctx);
    let effective = scope;
    if (query.mine) {
      const own = await ownEmployee(ctx);
      if (!own) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
      effective = { employeeId: own.id };
    }
    return taskRepository.list(ctx.companyId, { ...query, today }, effective);
  },

  async board(ctx: TenantContext, filter: { projectId?: string; assigneeId?: string; mine?: boolean }) {
    authorize(ctx, "tasks:view");
    const scope = await taskScope(ctx);
    if (!scope) return [];
    if (filter.mine) {
      const own = await ownEmployee(ctx);
      return own ? taskRepository.board(ctx.companyId, { ...filter, assigneeId: own.id }, scope) : [];
    }
    return taskRepository.board(ctx.companyId, filter, scope);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "tasks:view");
    const scope = await taskScope(ctx);
    const task = scope ? await taskRepository.findById(ctx.companyId, id, scope) : null;
    if (!task) throw new NotFoundError("Task");
    return task;
  },

  /** What the user may do with this task now — drives the buttons; every action re-checks on the server. */
  abilities(ctx: TenantContext, task: Task) {
    const open = OPEN_PROJECT_STATUSES.some((status) => status === task.project.status);
    return {
      edit: open && can(ctx, "tasks:edit") && managesTasks(ctx),
      move: open && can(ctx, "tasks:edit"),
      attach: open && can(ctx, "tasks:edit"),
      delete: can(ctx, "tasks:delete"),
    };
  },

  /** Employees tasks can be assigned to (current staff). */
  async assignees(ctx: TenantContext) {
    authorize(ctx, "tasks:view");
    if (!managesTasks(ctx)) return [];
    const employees = await employeeRepository.options(ctx.companyId);
    return employees.filter((employee) => WORKFORCE_STATUSES.includes(employee.status));
  },

  async resolve(ctx: TenantContext, input: TaskInput, before?: Task) {
    const scope = await projectScope(ctx);
    const project = scope ? await projectRepository.findById(ctx.companyId, input.projectId, scope) : null;
    if (!project) throw new ValidationError("Choose a project.", { projectId: ["Choose a project."] });
    if (project.id !== before?.projectId && !OPEN_PROJECT_STATUSES.includes(project.status)) {
      throw new ValidationError("The project is completed or cancelled.", {
        projectId: ["Choose an open project."],
      });
    }
    const assigneeId = input.assigneeId || null;
    if (assigneeId && assigneeId !== before?.assigneeId) {
      const employee = await employeeRepository.findById(ctx.companyId, assigneeId);
      if (!employee || !WORKFORCE_STATUSES.includes(employee.status)) {
        throw new ValidationError("Assign the task to a current employee.", {
          assigneeId: ["Choose a current employee."],
        });
      }
    }
    return { projectId: project.id, assigneeId };
  },

  data(input: TaskInput, links: { projectId: string; assigneeId: string | null }, before?: Task) {
    return {
      ...links,
      name: input.name,
      priority: input.priority,
      status: input.status,
      startDate: input.startDate ? dateOnlyToDate(input.startDate) : null,
      dueDate: input.dueDate ? dateOnlyToDate(input.dueDate) : null,
      description: input.description || null,
      completedAt: input.status === "COMPLETED" ? (before?.completedAt ?? new Date()) : null,
    };
  },

  async create(ctx: TenantContext, input: TaskInput) {
    authorize(ctx, "tasks:create");
    const links = await this.resolve(ctx, input);
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "task", tx);
      const task = await taskRepository.create(
        ctx.companyId,
        number,
        this.data(input, links),
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        { action: "task.create", entityType: "Task", entityId: task.id, after: snapshot(task) },
        tx,
      );
      return task;
    });
  },

  /** Full edit (task managers). */
  async update(ctx: TenantContext, id: string, input: TaskInput) {
    authorize(ctx, "tasks:edit");
    if (!managesTasks(ctx))
      throw new ForbiddenError("You can change the status of your tasks, not edit them.");
    const before = await this.get(ctx, id);
    assertProjectOpen(before);
    const links = await this.resolve(ctx, input, before);
    await db.$transaction(async (tx) => {
      if (!(await taskRepository.update(ctx.companyId, id, this.data(input, links, before), ctx.userId, tx)))
        throw new NotFoundError("Task");
      const after = await taskRepository.findById(ctx.companyId, id, {}, tx);
      if (!after) throw new NotFoundError("Task");
      await writeAuditLog(
        ctx,
        {
          action: "task.update",
          entityType: "Task",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
    });
  },

  /**
   * Moves a task to another status (Kanban drag and drop, "Move to" menu, detail page). Anyone with `tasks:edit`
   * may move the tasks they can see — an employee their own. The update only applies if the status is still what
   * the user saw, so two people moving the same card don't silently overwrite each other.
   */
  async setStatus(ctx: TenantContext, id: string, status: TaskStatusKey) {
    authorize(ctx, "tasks:edit");
    const task = await this.get(ctx, id);
    assertProjectOpen(task);
    if (task.status === status) return;
    await db.$transaction(async (tx) => {
      const moved = await taskRepository.update(
        ctx.companyId,
        id,
        { status, completedAt: status === "COMPLETED" ? new Date() : null },
        ctx.userId,
        tx,
        task.status,
      );
      if (!moved) throw new ConflictError("Someone else changed this task. Reload and try again.");
      await writeAuditLog(
        ctx,
        {
          action: "task.status",
          entityType: "Task",
          entityId: id,
          before: { status: task.status },
          after: { status },
          metadata: { summary: `${TASK_STATUS_LABELS[task.status]} → ${TASK_STATUS_LABELS[status]}` },
        },
        tx,
      );
    });
  },

  /** Assigns (or unassigns) a task — task managers only. */
  async assign(ctx: TenantContext, id: string, assigneeId: string | null) {
    authorize(ctx, "tasks:edit");
    if (!managesTasks(ctx)) throw new ForbiddenError("Only task managers can assign tasks.");
    const task = await this.get(ctx, id);
    assertProjectOpen(task);
    if ((task.assigneeId ?? null) === assigneeId) return;
    let name: string | null = null;
    if (assigneeId) {
      const employee = await employeeRepository.findById(ctx.companyId, assigneeId);
      if (!employee || !WORKFORCE_STATUSES.includes(employee.status)) {
        throw new ValidationError("Assign the task to a current employee.", {
          assigneeId: ["Choose a current employee."],
        });
      }
      name = employee.name;
    }
    await db.$transaction(async (tx) => {
      await taskRepository.update(ctx.companyId, id, { assigneeId }, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        {
          action: "task.assign",
          entityType: "Task",
          entityId: id,
          before: { assigneeId: task.assigneeId },
          after: { assigneeId },
          metadata: { summary: name ? `Assigned to ${name}` : "Unassigned" },
        },
        tx,
      );
    });
  },

  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "tasks:delete");
    const task = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await taskRepository.softDelete(ctx.companyId, id, ctx.userId, tx);
      if (count === 0) throw new NotFoundError("Task");
      await writeAuditLog(
        ctx,
        { action: "task.delete", entityType: "Task", entityId: id, before: snapshot(task) },
        tx,
      );
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Task", id, {
      actions: HISTORY_ACTIONS,
      fields: {
        name: "name",
        projectId: "project",
        assigneeId: "assignee",
        priority: "priority",
        status: "status",
        startDate: "start date",
        dueDate: "due date",
        description: "description",
      },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },

  // ─── Attachments ───

  async attachments(ctx: TenantContext, taskId: string) {
    await this.get(ctx, taskId);
    return taskAttachmentRepository.list(ctx.companyId, taskId);
  },

  async uploadAttachment(ctx: TenantContext, taskId: string, file: UploadedFile) {
    authorize(ctx, "tasks:edit");
    const task = await this.get(ctx, taskId);
    assertProjectOpen(task);
    const { name, type } = checkDocument(file);
    const key = companyKey(ctx.companyId, "tasks", taskId, `${crypto.randomUUID()}.${type.extension}`);
    return storeThenRecord(key, file.bytes, type.contentType, () =>
      db.$transaction(async (tx) => {
        const attachment = await taskAttachmentRepository.create(
          ctx.companyId,
          { taskId, name, storageKey: key, contentType: type.contentType, sizeBytes: file.bytes.byteLength },
          ctx.userId,
          tx,
        );
        await writeAuditLog(
          ctx,
          {
            action: "task.attachment_upload",
            entityType: "Task",
            entityId: taskId,
            after: {
              id: attachment.id,
              name,
              contentType: type.contentType,
              sizeBytes: file.bytes.byteLength,
            },
            metadata: { attachmentId: attachment.id, summary: name },
          },
          tx,
        );
        return attachment;
      }),
    );
  },

  async downloadAttachment(ctx: TenantContext, taskId: string, id: string) {
    await this.get(ctx, taskId);
    const attachment = await taskAttachmentRepository.findById(ctx.companyId, taskId, id);
    if (!attachment) throw new NotFoundError("Attachment");
    return { attachment, body: await readStored(attachment.storageKey, "Attachment") };
  },

  /** Removes an attachment: task managers any, others only what they uploaded. */
  async removeAttachment(ctx: TenantContext, taskId: string, id: string) {
    authorize(ctx, "tasks:edit");
    const task = await this.get(ctx, taskId);
    assertProjectOpen(task);
    const attachment = await taskAttachmentRepository.findById(ctx.companyId, taskId, id);
    if (!attachment) throw new NotFoundError("Attachment");
    if (!managesTasks(ctx) && attachment.createdById !== ctx.userId) {
      throw new ForbiddenError("You can only delete attachments you uploaded.");
    }
    await db.$transaction(async (tx) => {
      const { count } = await taskAttachmentRepository.delete(ctx.companyId, taskId, id, tx);
      if (count === 0) throw new NotFoundError("Attachment");
      await writeAuditLog(
        ctx,
        {
          action: "task.attachment_delete",
          entityType: "Task",
          entityId: taskId,
          before: { id, name: attachment.name },
          metadata: { attachmentId: id, summary: attachment.name },
        },
        tx,
      );
    });
    await deleteStoredQuietly(attachment.storageKey);
  },
};
