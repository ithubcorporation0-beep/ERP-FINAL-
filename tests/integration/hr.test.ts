import { describe, expect, it } from "vitest";
import { addDays, todayInZone } from "@/lib/date-range";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import {
  attendanceListQuerySchema,
  compensationSchema,
  employeeListQuerySchema,
  leaveListQuerySchema,
} from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";
import { compensationService } from "@/server/services/compensation.service";
import { dashboardService } from "@/server/services/dashboard.service";
import { departmentService } from "@/server/services/department.service";
import { employeeDocumentService } from "@/server/services/employee-document.service";
import { employeeService } from "@/server/services/employee.service";
import { leaveService } from "@/server/services/leave.service";
import { settingsService } from "@/server/services/settings.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const today = () => todayInZone("UTC");

/**
 * Every day is a working day starting 09:00 (10 min grace, half day under 4 h), so tests don't depend on the
 * weekday. `end` defaults to 17:00; tests that look at "today" use 23:59 so today is still in progress.
 */
async function hrCompany(name: string, end = "17:00") {
  const owner = await createCompanyWithOwner(name);
  await settingsService.set(owner, "hr.workDays", [0, 1, 2, 3, 4, 5, 6]);
  await settingsService.set(owner, "hr.workdayEnd", end);
  return owner;
}

function newEmployee(ctx: TenantContext, overrides: Record<string, unknown> = {}) {
  return employeeService.create(ctx, {
    name: "Sara Khan",
    email: "sara@example.test",
    phone: "+92 300 1234567",
    identificationNumber: "35202-1234567-1",
    position: "Engineer",
    joiningDate: addDays(today(), -60),
    ...overrides,
  });
}

/** A member with a built-in role whose login is linked to an employee record. */
async function linkedMember(owner: TenantContext, role: string, name = `${role} Person`) {
  const { ctx } = await addMember(owner, role);
  const employee = await newEmployee(owner, { name, email: "", userId: ctx.userId });
  return { ctx, employee };
}

async function thrown(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected a rejection");
}

describe("employees and departments", () => {
  it("creates numbered employees in a department, links a login once, and audits changes", async () => {
    const owner = await hrCompany("People Co");
    const department = await departmentService.create(owner, { name: "Engineering" });
    await expect(departmentService.create(owner, { name: "engineering" })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const { ctx: member } = await addMember(owner, "Employee");
    const first = await newEmployee(owner, { departmentId: department.id, userId: member.userId });
    const second = await newEmployee(owner, { name: "Ali Raza", email: "" });
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(first.department?.name).toBe("Engineering");
    expect(first.status).toBe("ACTIVE");

    // The same login can't be linked to two employee records.
    await expect(newEmployee(owner, { name: "Dup", userId: member.userId })).rejects.toBeInstanceOf(
      ValidationError,
    );

    const list = await employeeService.list(owner, employeeListQuerySchema.parse({ search: "EMP-0002" }));
    expect(list.items.map((employee) => employee.name)).toEqual(["Ali Raza"]);

    await employeeService.update(owner, first.id, {
      name: "Sara Khan",
      position: "Senior Engineer",
      joiningDate: addDays(today(), -60),
      departmentId: department.id,
      userId: member.userId,
    });
    const history = await employeeService.history(owner, first.id);
    expect(history.map((entry) => entry.label)).toEqual(["Updated", "Created"]);

    // A department with employees can't be deleted; an empty one can.
    await expect(departmentService.remove(owner, department.id)).rejects.toBeInstanceOf(ConflictError);
    const empty = await departmentService.create(owner, { name: "Unused" });
    await departmentService.remove(owner, empty.id);
  });

  it("manages employment status with an exit date, enforced by the database too", async () => {
    const owner = await hrCompany("Status Co");
    const employee = await newEmployee(owner);
    await expect(
      employeeService.changeStatus(owner, employee.id, { status: "RESIGNED" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      employeeService.changeStatus(owner, employee.id, {
        status: "RESIGNED",
        exitDate: addDays(today(), -90),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await employeeService.changeStatus(owner, employee.id, {
      status: "RESIGNED",
      exitDate: today(),
      note: "Moved abroad",
    });
    expect((await employeeService.get(owner, employee.id)).status).toBe("RESIGNED");
    // Returning to work clears the exit date.
    await employeeService.changeStatus(owner, employee.id, { status: "ACTIVE" });
    expect((await employeeService.get(owner, employee.id)).exitDate).toBeNull();

    await expect(
      rawDb.employee.update({ where: { id: employee.id }, data: { status: "TERMINATED", exitDate: null } }),
    ).rejects.toThrow(/employees_exit_date_required/);

    await employeeService.remove(owner, employee.id);
    await expect(employeeService.get(owner, employee.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("stores employee documents under the company's folder", async () => {
    const owner = await hrCompany("Docs Co");
    const employee = await newEmployee(owner);
    const document = await employeeDocumentService.upload(owner, employee.id, {
      name: "contract.pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 contract"),
    });
    expect(document.storageKey.startsWith(`companies/${owner.companyId}/employees/${employee.id}/`)).toBe(
      true,
    );
    const { body } = await employeeDocumentService.download(owner, employee.id, document.id);
    expect(new TextDecoder().decode(body)).toContain("contract");
    await expect(
      employeeDocumentService.upload(owner, employee.id, {
        name: "x.exe",
        bytes: new Uint8Array([0x4d, 0x5a]),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await employeeDocumentService.remove(owner, employee.id, document.id);
    expect(await employeeDocumentService.list(owner, employee.id)).toEqual([]);
  });
});

describe("salary and bank security", () => {
  it("restricts salary and bank details to salaries:* and encrypts account numbers at rest", async () => {
    const owner = await hrCompany("Payroll Co");
    const employee = await newEmployee(owner);
    const { ctx: hr } = await addMember(owner, "HR Manager");
    const { ctx: manager } = await addMember(owner, "Manager");

    await compensationService.update(
      hr,
      employee.id,
      compensationSchema.parse({
        salary: "185000.50",
        bankName: "Meezan Bank",
        accountTitle: "Sara Khan",
        accountNumber: "0101-2345678901",
        iban: "pk36 scbl 0000 0011 2345 6702",
      }),
    );

    // Masked by default…
    const shown = await compensationService.get(hr, employee.id);
    expect(shown).toMatchObject({
      salary: "185000.50",
      bankName: "Meezan Bank",
      accountNumber: "•••• 8901",
      iban: "•••• 6702",
    });
    // …full numbers only on an explicit, audited reveal.
    expect(await compensationService.reveal(hr, employee.id)).toEqual({
      accountNumber: "0101-2345678901",
      iban: "PK36SCBL0000001123456702",
    });

    // Encrypted in the database: no plain number anywhere in the row.
    const row = await rawDb.employeeCompensation.findFirstOrThrow({ where: { employeeId: employee.id } });
    expect(row.accountNumberCipher).toMatch(/^v1:/);
    expect(JSON.stringify(row)).not.toContain("2345678901");
    expect(JSON.stringify(row)).not.toContain("SCBL0000001123456702");

    // Audit logs name what changed, never the values.
    const audit = await rawDb.auditLog.findMany({
      where: { companyId: owner.companyId, entityId: employee.id },
    });
    const auditText = JSON.stringify(audit);
    expect(auditText).not.toContain("185000");
    expect(auditText).not.toContain("2345678901");
    expect(audit.map((event) => event.action)).toEqual(
      expect.arrayContaining(["employee.compensation_update", "employee.bank_reveal"]),
    );

    // A manager can see the employee but not the pay; the employee profile never carries it.
    expect((await employeeService.get(manager, employee.id)).name).toBe("Sara Khan");
    await expect(compensationService.get(manager, employee.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(compensationService.reveal(manager, employee.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(JSON.stringify(await employeeService.get(owner, employee.id))).not.toContain("185000");

    // A ciphertext moved to another employee doesn't decrypt (bound to company + employee + field).
    const other = await newEmployee(owner, { name: "Other" });
    await rawDb.employeeCompensation.create({
      data: {
        companyId: owner.companyId,
        employeeId: other.id,
        currency: "USD",
        accountNumberCipher: row.accountNumberCipher,
        accountNumberLast4: "8901",
      },
    });
    await expect(compensationService.reveal(hr, other.id)).rejects.toThrow();

    // Leaving the number empty keeps it; "remove" clears it.
    await compensationService.update(
      hr,
      employee.id,
      compensationSchema.parse({ salary: "190000", bankName: "Meezan Bank" }),
    );
    expect((await compensationService.get(hr, employee.id)).accountNumber).toBe("•••• 8901");
    await compensationService.update(
      hr,
      employee.id,
      compensationSchema.parse({ salary: "190000", removeAccountNumber: true }),
    );
    expect((await compensationService.get(hr, employee.id)).accountNumber).toBeNull();
  });
});

describe("attendance", () => {
  it("records self check-in / check-out once a day and keeps employees to their own records", async () => {
    const owner = await hrCompany("Clock Co");
    const { ctx: worker, employee } = await linkedMember(owner, "Employee", "Worker One");
    const { ctx: stranger } = await addMember(owner, "Employee");

    await expect(attendanceService.checkIn(stranger)).rejects.toBeInstanceOf(ConflictError); // not linked
    const record = await attendanceService.checkIn(worker);
    expect(record.source).toBe("SELF");
    await expect(attendanceService.checkIn(worker)).rejects.toBeInstanceOf(ConflictError);
    await attendanceService.checkOut(worker);
    await expect(attendanceService.checkOut(worker)).rejects.toBeInstanceOf(ConflictError);
    const day = await attendanceService.myDay(worker);
    expect(day.record?.checkOutAt).not.toBeNull();
    expect(day.canCheckIn).toBe(false);

    // Employees see only their own history and can't enter or correct days.
    const other = await newEmployee(owner, { name: "Someone Else", email: "" });
    const otherDay = await attendanceService.saveEntry(owner, {
      employeeId: other.id,
      date: addDays(today(), -1),
      absent: false,
      checkIn: "09:00",
      checkOut: "17:00",
    });
    const history = await attendanceService.list(
      worker,
      attendanceListQuerySchema.parse({ employeeId: other.id }),
    );
    expect(history.items.map((item) => item.employeeId)).toEqual([employee.id]);
    await expect(attendanceService.get(worker, otherDay.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      attendanceService.saveEntry(worker, {
        employeeId: employee.id,
        date: today(),
        absent: false,
        checkIn: "08:00",
        checkOut: "",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attendanceService.today(worker)).rejects.toBeInstanceOf(ForbiddenError);

    // Correcting a self-recorded day needs a note.
    await expect(
      attendanceService.saveEntry(owner, {
        employeeId: employee.id,
        date: today(),
        absent: false,
        checkIn: "09:00",
        checkOut: "17:00",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("detects late arrival, early departure, half days and absences with exact rules", async () => {
    const owner = await hrCompany("Rules Co");
    const employee = await newEmployee(owner, { joiningDate: addDays(today(), -10) });
    const entry = (daysAgo: number, checkIn: string, checkOut: string, absent = false) =>
      attendanceService.saveEntry(owner, {
        employeeId: employee.id,
        date: addDays(today(), -daysAgo),
        absent,
        checkIn,
        checkOut,
      });
    await entry(1, "09:10", "17:00"); // within the 10-minute grace → present
    await entry(2, "09:11", "17:30"); // late by 11 minutes
    await entry(3, "09:00", "16:30"); // early departure (30 min), still a full day
    await entry(4, "09:00", "12:30"); // 3.5 h worked → half day
    await entry(5, "", "", true); // marked absent by HR
    // day 6: approved leave; days 7–10: nothing recorded → absent

    const { ctx: hr } = await addMember(owner, "HR Manager");
    const leave = await leaveService.create(hr, {
      employeeId: employee.id,
      type: "SICK",
      startDate: addDays(today(), -6),
      endDate: addDays(today(), -6),
      reason: "Flu",
    });
    await leaveService.approve(owner, leave.id);

    const records = await attendanceService.list(
      owner,
      attendanceListQuerySchema.parse({ employeeId: employee.id, range: "last-3-months" }),
    );
    const byDate = Object.fromEntries(
      records.items.map((item) => [item.date.toISOString().slice(0, 10), item]),
    );
    expect(byDate[addDays(today(), -1)]).toMatchObject({ status: "PRESENT", lateMinutes: 0 });
    expect(byDate[addDays(today(), -2)]).toMatchObject({
      status: "LATE",
      lateMinutes: 11,
      workedMinutes: 499,
    });
    expect(byDate[addDays(today(), -3)]).toMatchObject({ status: "PRESENT", earlyLeaveMinutes: 30 });
    expect(byDate[addDays(today(), -4)]).toMatchObject({ status: "HALF_DAY", workedMinutes: 210 });
    expect(byDate[addDays(today(), -5)]).toMatchObject({ status: "ABSENT", checkInAt: null });

    // The database refuses an absent day with times.
    await expect(
      rawDb.attendanceRecord.update({
        where: { id: byDate[addDays(today(), -5)]?.id ?? "" },
        data: { checkInAt: new Date() },
      }),
    ).rejects.toThrow(/attendance_records_times_match_status/);

    const report = await attendanceService.report(owner, { range: "last-3-months" });
    const row = report.rows.find((item) => item.employee.id === employee.id);
    // Working days from joining (10 days ago) to today = 11. Today has no record: pending until 17:00, then absent.
    const todayOver = new Date().getUTCHours() >= 17;
    expect(row?.totals).toMatchObject({
      workingDays: 11,
      present: 4,
      late: 1,
      halfDay: 1,
      onLeave: 1,
      earlyDepartures: 2, // the half day left early too
      absent: todayOver ? 6 : 5, // day 5 (marked) + days 7–10 (+ today once it's over)
      pending: todayOver ? 0 : 1,
    });
  });

  it("shows today's attendance dashboard to HR and managers", async () => {
    const owner = await hrCompany("Today Co", "23:59");
    const { ctx: worker } = await linkedMember(owner, "Employee", "Early Bird");
    const onLeave = await newEmployee(owner, { name: "Away", email: "" });
    await newEmployee(owner, { name: "No Show", email: "" });
    await attendanceService.checkIn(worker);
    const leave = await leaveService.create(owner, {
      employeeId: onLeave.id,
      type: "ANNUAL",
      startDate: today(),
      endDate: addDays(today(), 2),
      reason: "Holiday",
    });
    await leaveService.approve(owner, leave.id);

    const { ctx: manager } = await addMember(owner, "Manager");
    const summary = await attendanceService.today(manager);
    expect(summary).toMatchObject({ totalEmployees: 3, present: 1, onLeave: 1, absent: 1, workingDay: true });

    const dashboard = await dashboardService.scope(owner, "this-month");
    const kpis = await dashboardService.kpis(dashboard);
    expect(kpis.find((kpi) => kpi.id === "totalEmployees")).toMatchObject({
      state: { status: "ready", data: { value: "3" } },
    });
  });
});

describe("leave", () => {
  it("runs the request → approve / reject workflow with overlap checks and segregation of duties", async () => {
    const owner = await hrCompany("Leave Co");
    const { ctx: worker, employee } = await linkedMember(owner, "Employee", "Leave Taker");
    const { ctx: manager, employee: managerEmployee } = await linkedMember(owner, "Manager", "Team Lead");
    const { ctx: hr } = await linkedMember(owner, "HR Manager", "HR Lead");

    const leave = await leaveService.create(worker, {
      type: "ANNUAL",
      startDate: addDays(today(), 10),
      endDate: addDays(today(), 14),
      reason: "Family wedding",
    });
    expect(leave).toMatchObject({ number: 1, days: 5, status: "PENDING", employeeId: employee.id });

    // Overlapping requests are refused; employees can't file for others.
    await expect(
      leaveService.create(worker, {
        type: "CASUAL",
        startDate: addDays(today(), 14),
        endDate: addDays(today(), 15),
        reason: "Overlap",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      leaveService.create(worker, {
        employeeId: managerEmployee.id,
        type: "CASUAL",
        startDate: addDays(today(), 30),
        endDate: addDays(today(), 30),
        reason: "Not mine",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    // Employees can't approve; approvers can't decide their own request.
    await expect(leaveService.approve(worker, leave.id)).rejects.toBeInstanceOf(ForbiddenError);
    const own = await leaveService.create(hr, {
      type: "SICK",
      startDate: today(),
      endDate: today(),
      reason: "Doctor visit",
    });
    await expect(leaveService.approve(hr, own.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(leaveService.reject(manager, leave.id, "")).rejects.toBeInstanceOf(ValidationError);

    await leaveService.approve(manager, leave.id, "Enjoy");
    await expect(leaveService.approve(manager, leave.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(leaveService.cancel(worker, leave.id)).rejects.toBeInstanceOf(ConflictError);
    const history = await leaveService.history(worker, leave.id);
    expect(history.map((entry) => entry.label)).toEqual(["Approved", "Requested"]);

    // Employees see only their own requests; a manager sees everyone's.
    const mine = await leaveService.list(worker, leaveListQuerySchema.parse({}));
    expect(mine.items.map((item) => item.id)).toEqual([leave.id]);
    await expect(leaveService.get(worker, own.id)).rejects.toBeInstanceOf(NotFoundError);
    expect((await leaveService.list(manager, leaveListQuerySchema.parse({}))).total).toBe(2);

    // The owner can reject the manager's request; an attachment can be added while pending.
    const another = await leaveService.create(worker, {
      type: "SICK",
      startDate: addDays(today(), 20),
      endDate: addDays(today(), 20),
      reason: "Check-up",
    });
    await leaveService.uploadAttachment(worker, another.id, {
      name: "certificate.pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 note"),
    });
    expect((await leaveService.attachment(worker, another.id)).name).toBe("certificate.pdf");
    await leaveService.cancel(worker, another.id);
    await expect(leaveService.get(worker, another.id)).rejects.toBeInstanceOf(NotFoundError);
    await leaveService.reject(owner, own.id, "Please reschedule");
    expect((await leaveService.get(manager, own.id)).status).toBe("REJECTED");
  });
});

describe("HR tenant isolation", () => {
  it("never shows or changes another company's employees, pay, attendance or leave", async () => {
    const ownerA = await hrCompany("HR A");
    const ownerB = await hrCompany("HR B");
    const employeeA = await newEmployee(ownerA);
    const departmentA = await departmentService.create(ownerA, { name: "Ops" });
    await compensationService.update(ownerA, employeeA.id, compensationSchema.parse({ salary: "1000" }));
    const dayA = await attendanceService.saveEntry(ownerA, {
      employeeId: employeeA.id,
      date: today(),
      absent: true,
      checkIn: "",
      checkOut: "",
    });
    const leaveA = await leaveService.create(ownerA, {
      employeeId: employeeA.id,
      type: "ANNUAL",
      startDate: addDays(today(), 5),
      endDate: addDays(today(), 5),
      reason: "A only",
    });

    await expect(employeeService.get(ownerB, employeeA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(compensationService.get(ownerB, employeeA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(compensationService.reveal(ownerB, employeeA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(attendanceService.get(ownerB, dayA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(leaveService.get(ownerB, leaveA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(leaveService.approve(ownerB, leaveA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      attendanceService.saveEntry(ownerB, {
        employeeId: employeeA.id,
        date: today(),
        absent: true,
        checkIn: "",
        checkOut: "",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    // B can't put its employee in A's department.
    expect(await thrown(newEmployee(ownerB, { departmentId: departmentA.id }))).toBeInstanceOf(
      ValidationError,
    );
    expect((await employeeService.list(ownerB, employeeListQuerySchema.parse({}))).total).toBe(0);
  });
});
