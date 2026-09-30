import "server-only";
import { WORKFORCE_STATUSES } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { money } from "@/lib/money";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { SalaryAdvanceInput } from "@/lib/validation";
import { employeeRepository } from "@/server/repositories/employee.repository";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { salaryAdvanceRepository } from "@/server/repositories/salary-advance.repository";
import { writeAuditLog } from "./audit.service";
import { ledgerService } from "./ledger.service";
import { salesContext } from "./sales-shared";

/**
 * Salary advances (`ADV-0001`): paid out now (ledger rule P1), recovered in full by the next paid payroll run
 * whose month ends on or after the advance date. `payroll:view` to see, `payroll:create` to give one,
 * `payroll:delete` to cancel an outstanding one (reversal, rule P2).
 */
export const salaryAdvanceService = {
  async list(ctx: TenantContext, filter: { employeeId?: string } = {}) {
    authorize(ctx, "payroll:view");
    const advances = await salaryAdvanceRepository.list(ctx.companyId, filter);
    return advances.map((advance) => ({ ...advance, amount: money(advance.amount) }));
  },

  async create(ctx: TenantContext, input: SalaryAdvanceInput) {
    authorize(ctx, "payroll:create");
    const [employee, { today }] = await Promise.all([
      employeeRepository.findById(ctx.companyId, input.employeeId),
      salesContext(ctx),
    ]);
    if (!employee || !WORKFORCE_STATUSES.includes(employee.status)) {
      throw new ValidationError("Choose a current employee.", { employeeId: ["Choose a current employee."] });
    }
    if (input.advanceDate > today) {
      throw new ValidationError("The date can't be in the future.", { advanceDate: ["In the future."] });
    }
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "advance", tx);
      const advance = await salaryAdvanceRepository.create(
        ctx.companyId,
        number,
        {
          employeeId: employee.id,
          amount: money(input.amount),
          advanceDate: dateOnlyToDate(input.advanceDate),
          paymentMethod: input.paymentMethod,
          reason: input.reason,
        },
        ctx.userId,
        tx,
      );
      const entry = await ledgerService.postAdvancePaid(
        ctx.companyId,
        ctx.userId,
        advance,
        employee.name,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "payroll.advance_create",
          entityType: "SalaryAdvance",
          entityId: advance.id,
          metadata: {
            employeeId: employee.id,
            summary: `${formatRecordNumber("advance", number)} for ${employee.name} (posted as ${formatRecordNumber("journal", entry.number)})`,
          },
        },
        tx,
      );
      return advance;
    });
  },

  /** Cancels an advance that hasn't been recovered (the money was returned); the posting is reversed. */
  async cancel(ctx: TenantContext, id: string) {
    authorize(ctx, "payroll:delete");
    const advance = await salaryAdvanceRepository.findById(ctx.companyId, id);
    if (!advance) throw new NotFoundError("Salary advance");
    if (advance.status !== "OUTSTANDING")
      throw new ConflictError("Only outstanding advances can be cancelled.");
    const { today } = await salesContext(ctx);
    await db.$transaction(async (tx) => {
      if (!(await salaryAdvanceRepository.cancel(ctx.companyId, id, ctx.userId, tx)))
        throw new ConflictError("The advance changed meanwhile. Reload and try again.");
      await ledgerService.postAdvanceCancelled(ctx.companyId, ctx.userId, id, today, tx);
      await writeAuditLog(
        ctx,
        {
          action: "payroll.advance_cancel",
          entityType: "SalaryAdvance",
          entityId: id,
          metadata: {
            employeeId: advance.employeeId,
            summary: formatRecordNumber("advance", advance.number),
          },
        },
        tx,
      );
    });
  },
};
