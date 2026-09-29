"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import {
  attendanceEntrySchema,
  compensationSchema,
  departmentSchema,
  employeeSchema,
  employeeStatusSchema,
  idSchema,
  leaveDecisionSchema,
  leaveRejectSchema,
  leaveSchema,
  workScheduleSchema,
} from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";
import { compensationService } from "@/server/services/compensation.service";
import { departmentService } from "@/server/services/department.service";
import { employeeService } from "@/server/services/employee.service";
import { leaveService } from "@/server/services/leave.service";
import { settingsService } from "@/server/services/settings.service";

/** Server actions for the HR pages: parse → authorize → service. Every rule is enforced again in the services. */

function revalidateHr() {
  revalidatePath("/hr", "layout");
}

// ─── Employees and departments ───

export async function createEmployeeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("employees:create");
    const employee = await employeeService.create(ctx, employeeSchema.parse(input));
    revalidateHr();
    return { id: employee.id };
  });
}

export async function updateEmployeeAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees:edit");
    await employeeService.update(ctx, idSchema.parse(id), employeeSchema.parse(input));
    revalidateHr();
  });
}

export async function changeEmployeeStatusAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees:edit");
    await employeeService.changeStatus(ctx, idSchema.parse(id), employeeStatusSchema.parse(input));
    revalidateHr();
  });
}

export async function deleteEmployeeAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees:delete");
    await employeeService.remove(ctx, idSchema.parse(id));
    revalidateHr();
  });
}

export async function updateCompensationAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("salaries:edit");
    await compensationService.update(ctx, idSchema.parse(id), compensationSchema.parse(input));
    revalidateHr();
  });
}

/** Full bank details for one employee — audited in the service. */
export async function revealBankDetailsAction(
  id: unknown,
): Promise<ActionResult<{ accountNumber: string | null; iban: string | null }>> {
  return runAction(async () => {
    const ctx = await requirePermission("salaries:view");
    return compensationService.reveal(ctx, idSchema.parse(id));
  });
}

export async function createDepartmentAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees:create");
    await departmentService.create(ctx, departmentSchema.parse(input));
    revalidateHr();
  });
}

export async function updateDepartmentAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees:edit");
    await departmentService.update(ctx, idSchema.parse(id), departmentSchema.parse(input));
    revalidateHr();
  });
}

export async function deleteDepartmentAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("employees:delete");
    await departmentService.remove(ctx, idSchema.parse(id));
    revalidateHr();
  });
}

// ─── Attendance ───

export async function checkInAction(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("attendance:create");
    await attendanceService.checkIn(ctx);
    revalidateHr();
  });
}

export async function checkOutAction(): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("attendance:create");
    await attendanceService.checkOut(ctx);
    revalidateHr();
  });
}

export async function saveAttendanceEntryAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("attendance:edit");
    await attendanceService.saveEntry(ctx, attendanceEntrySchema.parse(input));
    revalidateHr();
  });
}

export async function deleteAttendanceAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("attendance:delete");
    await attendanceService.remove(ctx, idSchema.parse(id));
    revalidateHr();
  });
}

// ─── Leave ───

export async function createLeaveAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("leaves:create");
    const leave = await leaveService.create(ctx, leaveSchema.parse(input));
    revalidateHr();
    return { id: leave.id };
  });
}

export async function approveLeaveAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("leaves:approve");
    const { id, note } = leaveDecisionSchema.parse(input);
    await leaveService.approve(ctx, id, note);
    revalidateHr();
  });
}

export async function rejectLeaveAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("leaves:reject");
    const { id, note } = leaveRejectSchema.parse(input);
    await leaveService.reject(ctx, id, note);
    revalidateHr();
  });
}

/** The employee's own pending request, or anyone's with `leaves:delete` (checked in the service). */
export async function cancelLeaveAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("leaves:view");
    await leaveService.cancel(ctx, idSchema.parse(id));
    revalidateHr();
  });
}

// ─── Work schedule (company settings) ───

export async function updateWorkScheduleAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("settings:manage");
    const values = workScheduleSchema.parse(input);
    await settingsService.set(ctx, "hr.workdayStart", values.workdayStart);
    await settingsService.set(ctx, "hr.workdayEnd", values.workdayEnd);
    await settingsService.set(ctx, "hr.lateGraceMinutes", values.lateGraceMinutes);
    await settingsService.set(ctx, "hr.halfDayMinutes", values.halfDayMinutes);
    await settingsService.set(
      ctx,
      "hr.workDays",
      [...values.workDays].sort((a, b) => a - b),
    );
    revalidatePath("/settings");
    revalidateHr();
  });
}
