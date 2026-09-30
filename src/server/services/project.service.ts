import "server-only";
import { WORKFORCE_STATUSES } from "@/config/hr";
import { OPEN_PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatusKey } from "@/config/projects";
import { formatRecordNumber } from "@/config/records";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { money } from "@/lib/money";
import { countTasks, daysLeft, projectOverdue, taskProgress, timeProgress } from "@/lib/projects";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { ProjectInput, ProjectListQuery } from "@/lib/validation";
import { customerRepository } from "@/server/repositories/customer.repository";
import { employeeRepository } from "@/server/repositories/employee.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import {
  projectRepository,
  type ProjectData,
  type ProjectScope,
} from "@/server/repositories/project.repository";
import { taskRepository } from "@/server/repositories/task.repository";
import { writeAuditLog } from "./audit.service";
import { ownEmployee } from "./hr-shared";
import { recordHistory, snapshotText } from "./record-history";
import { salesContext } from "./sales-shared";

/**
 * Projects (`PRJ-0001`). `projects:view` to read; `projects:create` / `edit` / `delete` to change. People who can
 * create, edit or delete projects see all of them; everyone else (e.g. the Employee role) sees only projects they
 * manage or have tasks in, through their linked employee record. Progress rules: src/lib/projects.ts.
 */

type Project = NonNullable<Awaited<ReturnType<typeof projectRepository.findById>>>;

export function seesAllProjects(ctx: TenantContext): boolean {
  return can(ctx, "projects:create") || can(ctx, "projects:edit") || can(ctx, "projects:delete");
}

/** The visibility scope of the user, or null when they may only see their own work but have no employee record. */
export async function projectScope(ctx: TenantContext): Promise<ProjectScope | null> {
  if (seesAllProjects(ctx)) return {};
  const own = await ownEmployee(ctx);
  return own ? { employeeId: own.id } : null;
}

function snapshot(project: Project) {
  return {
    code: formatRecordNumber("project", project.number),
    name: project.name,
    customerId: project.customerId,
    managerId: project.managerId,
    startDate: project.startDate ? dateToDateOnly(project.startDate) : null,
    endDate: project.endDate ? dateToDateOnly(project.endDate) : null,
    budget: project.budget ? money(project.budget) : null,
    status: project.status,
    description: project.description,
  };
}

const HISTORY_ACTIONS: Record<string, string> = {
  "project.create": "Created",
  "project.update": "Updated",
  "project.delete": "Deleted",
};

export const projectService = {
  seesAll: seesAllProjects,

  async list(ctx: TenantContext, query: ProjectListQuery) {
    authorize(ctx, "projects:view");
    const scope = await projectScope(ctx);
    if (!scope) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    const page = await projectRepository.list(ctx.companyId, query, scope);
    return { ...page, items: await this.withProgress(ctx, page.items) };
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "projects:view");
    const scope = await projectScope(ctx);
    const project = scope ? await projectRepository.findById(ctx.companyId, id, scope) : null;
    if (!project) throw new NotFoundError("Project");
    return project;
  },

  /** Open projects the user can add tasks to. */
  async options(ctx: TenantContext) {
    authorize(ctx, "projects:view");
    const scope = await projectScope(ctx);
    return scope ? projectRepository.options(ctx.companyId, scope) : [];
  },

  /** Customers and managers (current employees) to choose from on the project form. */
  async formOptions(ctx: TenantContext) {
    if (!can(ctx, "projects:create")) authorize(ctx, "projects:edit");
    const [customers, employees] = await Promise.all([
      customerRepository.listOptions(ctx.companyId, 1000),
      employeeRepository.options(ctx.companyId),
    ]);
    return {
      customers: customers.map((customer) => ({
        value: customer.id,
        label: `${customer.name} · ${formatRecordNumber("customer", customer.number)}`,
      })),
      managers: employees
        .filter((employee) => WORKFORCE_STATUSES.includes(employee.status))
        .map((employee) => ({
          value: employee.id,
          label: `${employee.name} · ${formatRecordNumber("employee", employee.number)}`,
        })),
    };
  },

  /** Adds task counts, work progress, time progress and deadline state to projects. */
  async withProgress<T extends Project>(ctx: TenantContext, projects: T[]) {
    const { today } = await salesContext(ctx);
    const tasks = await taskRepository.listForProjects(
      ctx.companyId,
      projects.map((project) => project.id),
    );
    return projects.map((project) => {
      const counts = countTasks(
        tasks
          .filter((task) => task.projectId === project.id)
          .map((task) => ({
            status: task.status,
            dueDate: task.dueDate ? dateToDateOnly(task.dueDate) : null,
          })),
        today,
      );
      const start = project.startDate ? dateToDateOnly(project.startDate) : null;
      const end = project.endDate ? dateToDateOnly(project.endDate) : null;
      return {
        ...project,
        progress: {
          counts,
          work: taskProgress(counts.byStatus.COMPLETED, counts.total),
          time: OPEN_PROJECT_STATUSES.includes(project.status) ? timeProgress(start, end, today) : null,
          daysLeft: OPEN_PROJECT_STATUSES.includes(project.status) ? daysLeft(end, today) : null,
          overdue: projectOverdue(end, project.status, today),
        },
      };
    });
  },

  async detail(ctx: TenantContext, id: string) {
    const project = await this.get(ctx, id);
    const [withProgress] = await this.withProgress(ctx, [project]);
    if (!withProgress) throw new NotFoundError("Project");
    return withProgress;
  },

  /** Customer and manager must belong to this company; the manager must be a current employee. */
  async data(ctx: TenantContext, input: ProjectInput, before?: Project): Promise<ProjectData> {
    const customerId = input.customerId || null;
    if (customerId && customerId !== before?.customerId) {
      const customer = await customerRepository.findSummary(ctx.companyId, customerId);
      if (!customer || customer.deletedAt) {
        throw new ValidationError("Choose a customer.", {
          customerId: ["Choose a customer of this company."],
        });
      }
    }
    const managerId = input.managerId || null;
    if (managerId && managerId !== before?.managerId) {
      const manager = await employeeRepository.findById(ctx.companyId, managerId);
      if (!manager || !WORKFORCE_STATUSES.includes(manager.status)) {
        throw new ValidationError("Choose a current employee as manager.", {
          managerId: ["Choose a current employee."],
        });
      }
    }
    const status: ProjectStatusKey = input.status;
    return {
      name: input.name,
      customerId,
      managerId,
      startDate: input.startDate ? dateOnlyToDate(input.startDate) : null,
      endDate: input.endDate ? dateOnlyToDate(input.endDate) : null,
      budget: input.budget ? money(input.budget) : null,
      status,
      description: input.description || null,
      // Completion time: kept while completed, set when it becomes completed, cleared when reopened.
      completedAt: status === "COMPLETED" ? (before?.completedAt ?? new Date()) : null,
    };
  },

  async create(ctx: TenantContext, input: ProjectInput) {
    authorize(ctx, "projects:create");
    const [data, { currency }] = await Promise.all([this.data(ctx, input), salesContext(ctx)]);
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "project", tx);
      const project = await projectRepository.create(ctx.companyId, number, currency, data, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        { action: "project.create", entityType: "Project", entityId: project.id, after: snapshot(project) },
        tx,
      );
      return project;
    });
  },

  async update(ctx: TenantContext, id: string, input: ProjectInput) {
    authorize(ctx, "projects:edit");
    const before = await this.get(ctx, id);
    const data = await this.data(ctx, input, before);
    await db.$transaction(async (tx) => {
      if (!(await projectRepository.update(ctx.companyId, id, data, ctx.userId, tx)))
        throw new NotFoundError("Project");
      const after = await projectRepository.findById(ctx.companyId, id, {}, tx);
      if (!after) throw new NotFoundError("Project");
      await writeAuditLog(
        ctx,
        {
          action: "project.update",
          entityType: "Project",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
          metadata:
            before.status !== after.status
              ? {
                  summary: `${PROJECT_STATUS_LABELS[before.status]} → ${PROJECT_STATUS_LABELS[after.status]}`,
                }
              : undefined,
        },
        tx,
      );
    });
  },

  /** Deletes a project without tasks. Projects with tasks are completed or cancelled instead. */
  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "projects:delete");
    const project = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await projectRepository.softDelete(ctx.companyId, id, ctx.userId, tx);
      if (count === 0) {
        throw new ConflictError(
          "Projects with tasks can't be deleted. Mark it completed or cancelled instead.",
        );
      }
      await writeAuditLog(
        ctx,
        { action: "project.delete", entityType: "Project", entityId: id, before: snapshot(project) },
        tx,
      );
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Project", id, {
      actions: HISTORY_ACTIONS,
      fields: {
        name: "name",
        customerId: "customer",
        managerId: "manager",
        startDate: "start date",
        endDate: "end date",
        budget: "budget",
        status: "status",
        description: "description",
      },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },

  /** Projects of one customer (customer page). */
  async forCustomer(ctx: TenantContext, customerId: string) {
    return this.list(ctx, { page: 1, pageSize: 50, customerId });
  },

  /** Report: every visible project with progress, projects per status, and open work per assignee. */
  async report(ctx: TenantContext) {
    authorize(ctx, "projects:view");
    const scope = await projectScope(ctx);
    if (!scope) return { projects: [], byStatus: [], workload: [], today: (await salesContext(ctx)).today };
    const [projects, { today }, open] = await Promise.all([
      projectRepository.listAll(ctx.companyId, scope),
      salesContext(ctx),
      taskRepository.listOpen(ctx.companyId, scope),
    ]);
    const withProgress = await this.withProgress(ctx, projects);
    const workload = new Map<
      string,
      { id: string | null; name: string; open: number; overdue: number; urgent: number }
    >();
    for (const task of open) {
      const key = task.assignee?.id ?? "unassigned";
      const row = workload.get(key) ?? {
        id: task.assignee?.id ?? null,
        name: task.assignee?.name ?? "Unassigned",
        open: 0,
        overdue: 0,
        urgent: 0,
      };
      row.open += 1;
      if (task.dueDate && dateToDateOnly(task.dueDate) < today) row.overdue += 1;
      if (task.priority === "URGENT") row.urgent += 1;
      workload.set(key, row);
    }
    const byStatus = await projectRepository.countByStatus(ctx.companyId, scope);
    return {
      today,
      projects: withProgress,
      byStatus,
      workload: [...workload.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name)),
    };
  },
};
