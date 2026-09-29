import "server-only";
import { WORKFORCE_STATUSES, type LeaveStatusKey } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import { employedOn, workingDays } from "@/lib/attendance";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { companyKey } from "@/lib/storage";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { LeaveInput, LeaveListQuery } from "@/lib/validation";
import { employeeRepository } from "@/server/repositories/employee.repository";
import { leaveRepository, type LeaveScope } from "@/server/repositories/leave.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { writeAuditLog } from "./audit.service";
import { ownEmployee, workSchedule } from "./hr-shared";
import { recordHistory, snapshotText } from "./record-history";
import {
  checkDocument,
  deleteStoredQuietly,
  readStored,
  storeThenRecord,
  type UploadedFile,
} from "./stored-files";

/**
 * Leave requests (`LV-0001`): Pending → Approved / Rejected.
 * - Everyone with `leaves:create` requests leave for themselves (their login must be linked to an employee record);
 *   `leaves:edit` may file for any employee.
 * - `leaves:approve` / `leaves:reject` decide — never on their own request (segregation of duties).
 * - People with `leaves:approve`, `leaves:edit` or `employees:view` see all requests; others only their own.
 * - A pending request can be cancelled by its employee, or by `leaves:delete`.
 * - Requests may not overlap the employee's other pending or approved leave (checked under a row lock).
 */

const OPEN: LeaveStatusKey[] = ["PENDING"];

function seesAll(ctx: TenantContext): boolean {
  return can(ctx, "leaves:approve") || can(ctx, "leaves:edit") || can(ctx, "employees:view");
}

type Leave = NonNullable<Awaited<ReturnType<typeof leaveRepository.findById>>>;

function isOwn(ctx: TenantContext, leave: Leave): boolean {
  return leave.employee.userId === ctx.userId;
}

function snapshot(leave: Leave) {
  return {
    code: formatRecordNumber("leave", leave.number),
    employeeId: leave.employeeId,
    type: leave.type,
    startDate: dateToDateOnly(leave.startDate),
    endDate: dateToDateOnly(leave.endDate),
    days: leave.days,
    reason: leave.reason,
    status: leave.status,
  };
}

const HISTORY_ACTIONS: Record<string, string> = {
  "leave.create": "Requested",
  "leave.approve": "Approved",
  "leave.reject": "Rejected",
  "leave.cancel": "Cancelled",
  "leave.attachment_upload": "Attachment added",
};

async function scope(ctx: TenantContext): Promise<LeaveScope | null> {
  if (seesAll(ctx)) return {};
  const own = await ownEmployee(ctx);
  return own ? { employeeId: own.id } : null;
}

export const leaveService = {
  seesAll,

  async list(ctx: TenantContext, query: LeaveListQuery) {
    authorize(ctx, "leaves:view");
    let visible = await scope(ctx);
    if (visible && query.mine) {
      const own = await ownEmployee(ctx);
      visible = own ? { employeeId: own.id } : null;
    }
    if (!visible) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
    return leaveRepository.list(ctx.companyId, query, visible);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "leaves:view");
    const visible = await scope(ctx);
    const leave = visible ? await leaveRepository.findById(ctx.companyId, id, visible) : null;
    if (!leave) throw new NotFoundError("Leave request");
    return leave;
  },

  /** What the user may do with this request now — drives the buttons; every action re-checks on the server. */
  abilities(ctx: TenantContext, leave: Leave) {
    const pending = leave.status === "PENDING";
    return {
      approve: pending && can(ctx, "leaves:approve") && !isOwn(ctx, leave),
      reject: pending && can(ctx, "leaves:reject") && !isOwn(ctx, leave),
      cancel: pending && (can(ctx, "leaves:delete") || (isOwn(ctx, leave) && can(ctx, "leaves:create"))),
      attach: pending && (can(ctx, "leaves:edit") || (isOwn(ctx, leave) && can(ctx, "leaves:create"))),
    };
  },

  /** Employees HR can file leave for (empty for people who file only for themselves). */
  async employees(ctx: TenantContext) {
    authorize(ctx, "leaves:view");
    return can(ctx, "leaves:edit") ? employeeRepository.options(ctx.companyId) : [];
  },

  async resolveEmployee(ctx: TenantContext, employeeId: string | undefined) {
    const own = await ownEmployee(ctx);
    if (!employeeId || employeeId === own?.id) {
      if (!own) throw new ConflictError("Your login isn't linked to an employee record. Ask HR to link it.");
      return own;
    }
    if (!can(ctx, "leaves:edit")) throw new ForbiddenError("You can only request leave for yourself.");
    const employee = await employeeRepository.findById(ctx.companyId, employeeId);
    if (!employee) throw new ValidationError("Choose an employee.", { employeeId: ["Choose an employee."] });
    return employee;
  },

  async create(ctx: TenantContext, input: LeaveInput) {
    authorize(ctx, "leaves:create");
    const [employee, schedule] = await Promise.all([
      this.resolveEmployee(ctx, input.employeeId),
      workSchedule(ctx),
    ]);
    if (!WORKFORCE_STATUSES.includes(employee.status)) {
      throw new ConflictError("Leave can't be requested for this employment status.");
    }
    const span = {
      status: employee.status,
      joiningDate: dateToDateOnly(employee.joiningDate),
      exitDate: employee.exitDate ? dateToDateOnly(employee.exitDate) : null,
    };
    if (!employedOn(span, input.startDate) || !employedOn(span, input.endDate)) {
      throw new ValidationError("The dates are outside the employment period.", {
        startDate: ["Outside the employment period."],
      });
    }
    const days = workingDays(input.startDate, input.endDate, schedule.workDays).length;
    if (days === 0) {
      throw new ValidationError("These dates contain no working days.", { endDate: ["No working days."] });
    }
    return db.$transaction(async (tx) => {
      if (!(await employeeRepository.lock(ctx.companyId, employee.id, tx)))
        throw new NotFoundError("Employee");
      const overlap = await leaveRepository.findOverlapping(
        ctx.companyId,
        employee.id,
        { start: input.startDate, end: input.endDate },
        null,
        tx,
      );
      if (overlap) {
        throw new ConflictError(
          `These dates overlap ${formatRecordNumber("leave", overlap.number)} (${overlap.status.toLowerCase()}).`,
        );
      }
      const number = await numberSequenceRepository.next(ctx.companyId, "leave", tx);
      const leave = await leaveRepository.create(
        ctx.companyId,
        number,
        {
          employeeId: employee.id,
          type: input.type,
          startDate: dateOnlyToDate(input.startDate),
          endDate: dateOnlyToDate(input.endDate),
          days,
          reason: input.reason,
        },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        { action: "leave.create", entityType: "LeaveRequest", entityId: leave.id, after: snapshot(leave) },
        tx,
      );
      return leave;
    });
  },

  async approve(ctx: TenantContext, id: string, note?: string) {
    authorize(ctx, "leaves:approve");
    const leave = await this.get(ctx, id);
    if (isOwn(ctx, leave)) throw new ForbiddenError("You can't approve your own leave request.");
    if (leave.status !== "PENDING") throw new ConflictError("Only pending requests can be approved.");
    await this.decide(ctx, leave, "APPROVED", note || null);
  },

  async reject(ctx: TenantContext, id: string, note: string) {
    authorize(ctx, "leaves:reject");
    if (note.trim().length < 3) {
      throw new ValidationError("Say why the request is rejected.", {
        note: ["Say why the request is rejected."],
      });
    }
    const leave = await this.get(ctx, id);
    if (isOwn(ctx, leave)) throw new ForbiddenError("You can't reject your own leave request.");
    if (leave.status !== "PENDING") throw new ConflictError("Only pending requests can be rejected.");
    await this.decide(ctx, leave, "REJECTED", note);
  },

  async decide(ctx: TenantContext, leave: Leave, status: "APPROVED" | "REJECTED", note: string | null) {
    await db.$transaction(async (tx) => {
      const moved = await leaveRepository.update(
        ctx.companyId,
        leave.id,
        OPEN,
        { status, decisionNote: note, decidedAt: new Date(), decidedById: ctx.userId },
        ctx.userId,
        tx,
      );
      if (!moved) throw new ConflictError("The request changed meanwhile. Reload and try again.");
      await writeAuditLog(
        ctx,
        {
          action: status === "APPROVED" ? "leave.approve" : "leave.reject",
          entityType: "LeaveRequest",
          entityId: leave.id,
          before: { status: leave.status },
          after: { status },
          metadata: { summary: note ?? undefined },
        },
        tx,
      );
    });
  },

  /** Cancels (soft-deletes) a pending request. */
  async cancel(ctx: TenantContext, id: string) {
    authorize(ctx, "leaves:view");
    const leave = await this.get(ctx, id);
    if (!this.abilities(ctx, leave).cancel) {
      if (leave.status !== "PENDING") throw new ConflictError("Only pending requests can be cancelled.");
      throw new ForbiddenError();
    }
    await db.$transaction(async (tx) => {
      const { count } = await leaveRepository.softDelete(ctx.companyId, id, OPEN, ctx.userId, tx);
      if (count === 0) throw new ConflictError("The request changed meanwhile. Reload and try again.");
      await writeAuditLog(
        ctx,
        { action: "leave.cancel", entityType: "LeaveRequest", entityId: id, before: snapshot(leave) },
        tx,
      );
    });
  },

  // ─── Attachment (medical certificate, etc.) ───

  async uploadAttachment(ctx: TenantContext, id: string, file: UploadedFile) {
    authorize(ctx, "leaves:view");
    const leave = await this.get(ctx, id);
    if (!this.abilities(ctx, leave).attach) {
      if (leave.status !== "PENDING")
        throw new ConflictError("Attachments can only change while the request is pending.");
      throw new ForbiddenError();
    }
    const { name, type } = checkDocument(file);
    const key = companyKey(ctx.companyId, "leaves", id, `${crypto.randomUUID()}.${type.extension}`);
    await storeThenRecord(key, file.bytes, type.contentType, () =>
      db.$transaction(async (tx) => {
        const updated = await leaveRepository.update(
          ctx.companyId,
          id,
          OPEN,
          {
            attachmentKey: key,
            attachmentName: name,
            attachmentContentType: type.contentType,
            attachmentSize: file.bytes.byteLength,
          },
          ctx.userId,
          tx,
        );
        if (!updated) throw new ConflictError("The request changed meanwhile. Reload and try again.");
        await writeAuditLog(
          ctx,
          {
            action: "leave.attachment_upload",
            entityType: "LeaveRequest",
            entityId: id,
            metadata: { summary: name },
          },
          tx,
        );
      }),
    );
    if (leave.attachmentKey) await deleteStoredQuietly(leave.attachmentKey);
  },

  async attachment(ctx: TenantContext, id: string) {
    const leave = await this.get(ctx, id);
    if (!leave.attachmentKey || !leave.attachmentContentType) throw new NotFoundError("Attachment");
    return {
      body: await readStored(leave.attachmentKey, "Attachment"),
      name: leave.attachmentName ?? "attachment",
      contentType: leave.attachmentContentType,
    };
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "LeaveRequest", id, {
      actions: HISTORY_ACTIONS,
      fields: { status: "status" },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },
};
