import "server-only";
import type { WorkSchedule } from "@/lib/attendance";
import type { TenantContext } from "@/lib/tenant";
import { employeeRepository } from "@/server/repositories/employee.repository";
import { settingsService } from "./settings.service";

/** The company's work schedule (settings `hr.*`). Any member may read it. */
export async function workSchedule(ctx: TenantContext): Promise<WorkSchedule> {
  const [start, end, graceMinutes, halfDayMinutes, workDays] = await Promise.all([
    settingsService.get(ctx, "hr.workdayStart"),
    settingsService.get(ctx, "hr.workdayEnd"),
    settingsService.get(ctx, "hr.lateGraceMinutes"),
    settingsService.get(ctx, "hr.halfDayMinutes"),
    settingsService.get(ctx, "hr.workDays"),
  ]);
  return { start, end, graceMinutes, halfDayMinutes, workDays };
}

/** The employee record linked to the signed-in member, if any (self-service attendance and leave). */
export function ownEmployee(ctx: TenantContext) {
  return employeeRepository.findByUser(ctx.companyId, ctx.userId);
}
