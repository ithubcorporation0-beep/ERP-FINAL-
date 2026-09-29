import "server-only";
import { EMPLOYMENT_STATUS_LABELS, EXIT_STATUSES } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import { dateOnlyToDate, dateToDateOnly } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { companyKey, getStorage } from "@/lib/storage";
import { IMAGE_TYPES, MAX_PHOTO_BYTES, detectImageType } from "@/lib/storage/images";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { EmployeeInput, EmployeeListQuery, EmployeeStatusInput } from "@/lib/validation";
import { departmentRepository } from "@/server/repositories/department.repository";
import { employeeRepository, type EmployeeData } from "@/server/repositories/employee.repository";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { writeAuditLog } from "./audit.service";
import { recordHistory, snapshotText } from "./record-history";
import { salesContext } from "./sales-shared";

/**
 * Employee records (`EMP-0001`). Reading needs `employees:view`; create / edit (incl. status, photo, documents) /
 * delete need `employees:create` / `edit` / `delete`. Salary and bank details are NOT here — see
 * compensation.service.ts (`salaries:*`).
 */

type Employee = NonNullable<Awaited<ReturnType<typeof employeeRepository.findById>>>;

function snapshot(employee: Employee) {
  return {
    code: formatRecordNumber("employee", employee.number),
    name: employee.name,
    email: employee.email,
    phone: employee.phone,
    identificationNumber: employee.identificationNumber,
    departmentId: employee.departmentId,
    position: employee.position,
    joiningDate: dateToDateOnly(employee.joiningDate),
    userId: employee.userId,
    emergencyContactName: employee.emergencyContactName,
    emergencyContactRelation: employee.emergencyContactRelation,
    emergencyContactPhone: employee.emergencyContactPhone,
    notes: employee.notes,
    status: employee.status,
  };
}

const HISTORY_ACTIONS: Record<string, string> = {
  "employee.create": "Created",
  "employee.update": "Updated",
  "employee.status_change": "Status changed",
  "employee.photo_update": "Photo updated",
  "employee.photo_remove": "Photo removed",
  "employee.document_upload": "Document uploaded",
  "employee.document_delete": "Document deleted",
  "employee.compensation_update": "Salary / bank details updated",
  "employee.bank_reveal": "Bank details viewed",
  "employee.delete": "Deleted",
};

async function deleteQuietly(key: string) {
  await getStorage()
    .delete(key)
    .catch((error: unknown) => logger.warn("Could not delete employee photo", { key, error }));
}

export const employeeService = {
  async list(ctx: TenantContext, query: EmployeeListQuery) {
    authorize(ctx, "employees:view");
    return employeeRepository.list(ctx.companyId, query);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "employees:view");
    const employee = await employeeRepository.findById(ctx.companyId, id);
    if (!employee) throw new NotFoundError("Employee");
    return employee;
  },

  /** Employees to choose from (e.g. HR filing leave or attendance for someone). */
  async options(ctx: TenantContext) {
    authorize(ctx, "employees:view");
    return employeeRepository.options(ctx.companyId);
  },

  /** Active members, for linking an employee record to a login. */
  async members(ctx: TenantContext) {
    authorize(ctx, "employees:view");
    return membershipRepository.listActiveUsers(ctx.companyId);
  },

  /** Department and login must belong to this company; a login can be linked to one employee only. */
  async resolveLinks(ctx: TenantContext, input: EmployeeInput, exceptId?: string) {
    const departmentId = input.departmentId || null;
    if (departmentId) {
      const department = await departmentRepository.findById(ctx.companyId, departmentId);
      if (!department || (!department.isActive && exceptId === undefined)) {
        throw new ValidationError("Choose a department.", { departmentId: ["Choose an active department."] });
      }
    }
    const userId = input.userId || null;
    if (userId) {
      const membership = await membershipRepository.findByUser(ctx.companyId, userId);
      if (membership?.status !== "ACTIVE") {
        throw new ValidationError("Choose a member of this company.", {
          userId: ["Choose an active member."],
        });
      }
      const linked = await employeeRepository.findLinkedUser(ctx.companyId, userId);
      if (linked && linked.id !== exceptId) {
        throw new ValidationError("This login already belongs to another employee.", {
          userId: ["Already linked to another employee."],
        });
      }
    }
    return { departmentId, userId };
  },

  data(input: EmployeeInput, links: { departmentId: string | null; userId: string | null }): EmployeeData {
    return {
      ...links,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      identificationNumber: input.identificationNumber || null,
      position: input.position || null,
      joiningDate: dateOnlyToDate(input.joiningDate),
      emergencyContactName: input.emergencyContactName || null,
      emergencyContactRelation: input.emergencyContactRelation || null,
      emergencyContactPhone: input.emergencyContactPhone || null,
      notes: input.notes || null,
    };
  },

  async create(ctx: TenantContext, input: EmployeeInput) {
    authorize(ctx, "employees:create");
    const links = await this.resolveLinks(ctx, input);
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "employee", tx);
      const employee = await employeeRepository.create(
        ctx.companyId,
        number,
        { ...this.data(input, links), status: input.status ?? "ACTIVE" },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "employee.create",
          entityType: "Employee",
          entityId: employee.id,
          after: snapshot(employee),
        },
        tx,
      );
      return employee;
    });
  },

  async update(ctx: TenantContext, id: string, input: EmployeeInput) {
    authorize(ctx, "employees:edit");
    const before = await this.get(ctx, id);
    const links = await this.resolveLinks(ctx, input, id);
    if (before.exitDate && dateToDateOnly(before.exitDate) < input.joiningDate) {
      throw new ValidationError("The joining date can't be after the exit date.", {
        joiningDate: ["After the exit date."],
      });
    }
    return db.$transaction(async (tx) => {
      if (!(await employeeRepository.update(ctx.companyId, id, this.data(input, links), ctx.userId, tx)))
        throw new NotFoundError("Employee");
      const after = await employeeRepository.findById(ctx.companyId, id, tx);
      if (!after) throw new NotFoundError("Employee");
      await writeAuditLog(
        ctx,
        {
          action: "employee.update",
          entityType: "Employee",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
      return after;
    });
  },

  /**
   * Employment status workflow. Resigned / terminated need the last working day (not before joining); returning
   * to an active status clears it. Every change is audited with its note.
   */
  async changeStatus(ctx: TenantContext, id: string, input: EmployeeStatusInput) {
    authorize(ctx, "employees:edit");
    const before = await this.get(ctx, id);
    const leaving = EXIT_STATUSES.includes(input.status);
    const exitDate = leaving ? input.exitDate || null : null;
    if (leaving && !exitDate) {
      throw new ValidationError("Enter the last working day.", { exitDate: ["Required."] });
    }
    if (exitDate && exitDate < dateToDateOnly(before.joiningDate)) {
      throw new ValidationError("The last working day can't be before the joining date.", {
        exitDate: ["Before the joining date."],
      });
    }
    if (
      input.status === before.status &&
      exitDate === (before.exitDate ? dateToDateOnly(before.exitDate) : null)
    ) {
      throw new ConflictError(
        `The employee is already ${EMPLOYMENT_STATUS_LABELS[before.status].toLowerCase()}.`,
      );
    }
    await db.$transaction(async (tx) => {
      const updated = await employeeRepository.update(
        ctx.companyId,
        id,
        { status: input.status, exitDate: exitDate ? dateOnlyToDate(exitDate) : null },
        ctx.userId,
        tx,
      );
      if (!updated) throw new NotFoundError("Employee");
      await writeAuditLog(
        ctx,
        {
          action: "employee.status_change",
          entityType: "Employee",
          entityId: id,
          before: {
            status: before.status,
            exitDate: before.exitDate ? dateToDateOnly(before.exitDate) : null,
          },
          after: { status: input.status, exitDate },
          metadata: {
            summary: `${EMPLOYMENT_STATUS_LABELS[before.status]} → ${EMPLOYMENT_STATUS_LABELS[input.status]}${
              input.note ? ` — ${input.note}` : ""
            }`,
          },
        },
        tx,
      );
    });
  },

  /** Soft delete. Attendance and leave history stay; the login link is released. */
  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "employees:delete");
    const employee = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await employeeRepository.softDelete(ctx.companyId, id, ctx.userId, tx);
      if (count === 0) throw new NotFoundError("Employee");
      await writeAuditLog(
        ctx,
        { action: "employee.delete", entityType: "Employee", entityId: id, before: snapshot(employee) },
        tx,
      );
    });
  },

  // ─── Photo ───

  /** PNG, JPEG or WebP up to 2 MB, detected from the bytes. Stored under companies/<id>/employees/<id>/. */
  async setPhoto(ctx: TenantContext, id: string, bytes: Uint8Array) {
    authorize(ctx, "employees:edit");
    const before = await this.get(ctx, id);
    if (bytes.byteLength === 0) throw new ValidationError("Choose a photo to upload.");
    if (bytes.byteLength > MAX_PHOTO_BYTES) throw new ValidationError("The photo must be 2 MB or smaller.");
    const type = detectImageType(bytes);
    if (!type) throw new ValidationError("Upload a PNG, JPEG or WebP image.");
    const key = companyKey(
      ctx.companyId,
      "employees",
      id,
      `photo-${crypto.randomUUID()}.${IMAGE_TYPES[type]}`,
    );
    const storage = getStorage();
    await storage.put(key, bytes, type);
    try {
      await db.$transaction(async (tx) => {
        const updated = await employeeRepository.update(
          ctx.companyId,
          id,
          { photoKey: key, photoContentType: type, photoUpdatedAt: new Date() },
          ctx.userId,
          tx,
        );
        if (!updated) throw new NotFoundError("Employee");
        await writeAuditLog(
          ctx,
          {
            action: "employee.photo_update",
            entityType: "Employee",
            entityId: id,
            after: { contentType: type, bytes: bytes.byteLength },
          },
          tx,
        );
      });
    } catch (error) {
      await storage
        .delete(key)
        .catch((cleanupError: unknown) => logger.warn("Orphaned employee photo", { key, cleanupError }));
      throw error;
    }
    if (before.photoKey) await deleteQuietly(before.photoKey);
  },

  async removePhoto(ctx: TenantContext, id: string) {
    authorize(ctx, "employees:edit");
    const before = await this.get(ctx, id);
    if (!before.photoKey) return;
    await db.$transaction(async (tx) => {
      await employeeRepository.update(
        ctx.companyId,
        id,
        { photoKey: null, photoContentType: null, photoUpdatedAt: new Date() },
        ctx.userId,
        tx,
      );
      await writeAuditLog(ctx, { action: "employee.photo_remove", entityType: "Employee", entityId: id }, tx);
    });
    await deleteQuietly(before.photoKey);
  },

  async photo(ctx: TenantContext, id: string) {
    const employee = await this.get(ctx, id);
    if (!employee.photoKey || !employee.photoContentType) throw new NotFoundError("Photo");
    const body = await getStorage().get(employee.photoKey);
    if (!body) {
      logger.error("Employee photo missing from storage", { employeeId: id, key: employee.photoKey });
      throw new NotFoundError("Photo");
    }
    return { body, contentType: employee.photoContentType };
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Employee", id, {
      actions: HISTORY_ACTIONS,
      fields: {
        name: "name",
        email: "email",
        phone: "phone",
        identificationNumber: "identification",
        departmentId: "department",
        position: "position",
        joiningDate: "joining date",
        userId: "login",
        emergencyContactName: "emergency contact",
        emergencyContactRelation: "emergency contact",
        emergencyContactPhone: "emergency contact",
        notes: "notes",
        status: "status",
        exitDate: "exit date",
      },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },

  /** Company defaults for the form. */
  async defaults(ctx: TenantContext) {
    const { today } = await salesContext(ctx);
    return { joiningDate: today };
  },
};

export type EmployeeRecord = Employee;
