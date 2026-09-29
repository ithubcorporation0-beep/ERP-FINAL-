import "server-only";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { DepartmentInput } from "@/lib/validation";
import { departmentRepository } from "@/server/repositories/department.repository";
import { writeAuditLog } from "./audit.service";

/** Departments: reading needs `employees:view`; create / edit / delete `employees:create` / `edit` / `delete`. */
export const departmentService = {
  async list(ctx: TenantContext) {
    authorize(ctx, "employees:view");
    return departmentRepository.list(ctx.companyId);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "employees:view");
    const department = await departmentRepository.findById(ctx.companyId, id);
    if (!department) throw new NotFoundError("Department");
    return department;
  },

  async assertUniqueName(ctx: TenantContext, name: string, exceptId?: string) {
    const existing = await departmentRepository.findByName(ctx.companyId, name);
    if (existing && existing.id !== exceptId) {
      throw new ValidationError("A department with this name already exists.", {
        name: ["Already exists."],
      });
    }
  },

  async create(ctx: TenantContext, input: DepartmentInput) {
    authorize(ctx, "employees:create");
    await this.assertUniqueName(ctx, input.name);
    return db.$transaction(async (tx) => {
      const department = await departmentRepository.create(
        ctx.companyId,
        { name: input.name, description: input.description || null },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "department.create",
          entityType: "Department",
          entityId: department.id,
          after: { name: department.name, description: department.description },
        },
        tx,
      );
      return department;
    });
  },

  async update(ctx: TenantContext, id: string, input: DepartmentInput) {
    authorize(ctx, "employees:edit");
    const before = await this.get(ctx, id);
    await this.assertUniqueName(ctx, input.name, id);
    await db.$transaction(async (tx) => {
      const data = {
        name: input.name,
        description: input.description || null,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      };
      if (!(await departmentRepository.update(ctx.companyId, id, data, ctx.userId, tx)))
        throw new NotFoundError("Department");
      await writeAuditLog(
        ctx,
        {
          action: "department.update",
          entityType: "Department",
          entityId: id,
          before: { name: before.name, description: before.description, isActive: before.isActive },
          after: { isActive: before.isActive, ...data },
        },
        tx,
      );
    });
  },

  /** Only an empty department can be deleted (deactivate it otherwise). */
  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "employees:delete");
    const department = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await departmentRepository.delete(ctx.companyId, id, tx);
      if (count === 0)
        throw new ConflictError("Departments with employees can't be deleted. Deactivate it instead.");
      await writeAuditLog(
        ctx,
        {
          action: "department.delete",
          entityType: "Department",
          entityId: id,
          before: { name: department.name },
        },
        tx,
      );
    });
  },
};
