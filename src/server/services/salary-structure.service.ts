import "server-only";
import { SALARY_COMPONENT_KIND_LABELS } from "@/config/payroll";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { money } from "@/lib/money";
import { calculatePayroll, sumComponents } from "@/lib/payroll";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { SalaryComponentInput } from "@/lib/validation";
import { compensationRepository } from "@/server/repositories/compensation.repository";
import { salaryStructureRepository } from "@/server/repositories/salary-structure.repository";
import { writeAuditLog } from "./audit.service";
import { employeeService } from "./employee.service";

/**
 * Salary structures: the basic salary (employee_compensations.salary, edited with the bank details) plus
 * recurring allowances, deductions and tax. Restricted like the salary: `salaries:view` / `salaries:edit`.
 * Audit entries name what changed, never the amounts (docs/payroll.md).
 */
export const salaryStructureService = {
  /** The structure with its monthly totals and the resulting net before bonus, overtime and advances. */
  async get(ctx: TenantContext, employeeId: string) {
    authorize(ctx, "salaries:view");
    await employeeService.get(ctx, employeeId);
    const [components, compensation] = await Promise.all([
      salaryStructureRepository.list(ctx.companyId, employeeId),
      compensationRepository.find(ctx.companyId, employeeId),
    ]);
    const basic = compensation?.salary ? money(compensation.salary) : null;
    const preview = calculatePayroll({
      basic: basic ?? "0",
      allowances: sumComponents(components, "ALLOWANCE"),
      bonus: "0",
      overtime: "0",
      deductions: sumComponents(components, "DEDUCTION"),
      tax: sumComponents(components, "TAX"),
      advances: "0",
    });
    return {
      basic,
      components: components.map((component) => ({ ...component, amount: money(component.amount) })),
      preview,
    };
  },

  async add(ctx: TenantContext, employeeId: string, input: SalaryComponentInput) {
    authorize(ctx, "salaries:edit");
    await employeeService.get(ctx, employeeId);
    await db.$transaction(async (tx) => {
      const component = await salaryStructureRepository.create(
        ctx.companyId,
        employeeId,
        { kind: input.kind, name: input.name, amount: money(input.amount), isActive: input.isActive ?? true },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "employee.structure_add",
          entityType: "Employee",
          entityId: employeeId,
          metadata: {
            componentId: component.id,
            summary: `${SALARY_COMPONENT_KIND_LABELS[input.kind]}: ${input.name}`,
          },
        },
        tx,
      );
    });
  },

  async update(ctx: TenantContext, employeeId: string, id: string, input: SalaryComponentInput) {
    authorize(ctx, "salaries:edit");
    await employeeService.get(ctx, employeeId);
    const before = await salaryStructureRepository.findById(ctx.companyId, employeeId, id);
    if (!before) throw new NotFoundError("Salary component");
    const data = {
      kind: input.kind,
      name: input.name,
      amount: money(input.amount),
      isActive: input.isActive ?? before.isActive,
    };
    const changed = [
      before.kind !== data.kind ? "type" : null,
      before.name !== data.name ? "name" : null,
      money(before.amount) !== data.amount ? "amount" : null,
      before.isActive !== data.isActive ? (data.isActive ? "activated" : "deactivated") : null,
    ].filter(Boolean);
    if (changed.length === 0) return;
    await db.$transaction(async (tx) => {
      if (!(await salaryStructureRepository.update(ctx.companyId, employeeId, id, data, ctx.userId, tx)))
        throw new NotFoundError("Salary component");
      await writeAuditLog(
        ctx,
        {
          action: "employee.structure_update",
          entityType: "Employee",
          entityId: employeeId,
          metadata: { componentId: id, summary: `${input.name} — changed: ${changed.join(", ")}` },
        },
        tx,
      );
    });
  },

  async remove(ctx: TenantContext, employeeId: string, id: string) {
    authorize(ctx, "salaries:edit");
    await employeeService.get(ctx, employeeId);
    const component = await salaryStructureRepository.findById(ctx.companyId, employeeId, id);
    if (!component) throw new NotFoundError("Salary component");
    await db.$transaction(async (tx) => {
      const { count } = await salaryStructureRepository.delete(ctx.companyId, employeeId, id, tx);
      if (count === 0) throw new NotFoundError("Salary component");
      await writeAuditLog(
        ctx,
        {
          action: "employee.structure_remove",
          entityType: "Employee",
          entityId: employeeId,
          metadata: {
            componentId: id,
            summary: `${SALARY_COMPONENT_KIND_LABELS[component.kind]}: ${component.name}`,
          },
        },
        tx,
      );
    });
  },
};
