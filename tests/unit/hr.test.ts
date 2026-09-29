import { describe, expect, it } from "vitest";
import { EMPLOYMENT_STATUSES, LEAVE_STATUSES, LEAVE_TYPES, ATTENDANCE_STATUSES } from "@/config/hr";
import { formatRecordNumber, parseRecordNumber } from "@/config/records";
import { AttendanceStatus, EmploymentStatus, LeaveStatus, LeaveType } from "@/generated/prisma/enums";
import {
  addDay,
  clockMinutes,
  dayStatus,
  emptyTotals,
  employedOn,
  evaluateDay,
  formatClock,
  rangesOverlap,
  workingDays,
  type WorkSchedule,
} from "@/lib/attendance";
import { toAuditJson } from "@/lib/audit/serialize";
import { decryptWithKey, encryptWithKey } from "@/lib/crypto/field-encryption";
import { zonedInstant } from "@/lib/date-range";
import {
  attendanceEntrySchema,
  compensationSchema,
  employeeSchema,
  employeeStatusSchema,
  leaveSchema,
  workScheduleSchema,
} from "@/lib/validation";

const sorted = (values: readonly string[]) => [...values].sort();

const SCHEDULE: WorkSchedule = {
  start: "09:00",
  end: "17:00",
  graceMinutes: 10,
  halfDayMinutes: 240,
  workDays: [1, 2, 3, 4, 5],
};

/** An instant at local "HH:MM" on 2026-09-28 (a Monday) in Karachi (UTC+5, no DST). */
const at = (time: string, date = "2026-09-28") => zonedInstant(date, clockMinutes(time), "Asia/Karachi");

describe("HR vocabulary", () => {
  it("matches the database enums", () => {
    expect(sorted(EMPLOYMENT_STATUSES)).toEqual(sorted(Object.values(EmploymentStatus)));
    expect(sorted(ATTENDANCE_STATUSES)).toEqual(sorted(Object.values(AttendanceStatus)));
    expect(sorted(LEAVE_TYPES)).toEqual(sorted(Object.values(LeaveType)));
    expect(sorted(LEAVE_STATUSES)).toEqual(sorted(Object.values(LeaveStatus)));
  });

  it("formats employee and leave numbers", () => {
    expect(formatRecordNumber("employee", 7)).toBe("EMP-0007");
    expect(formatRecordNumber("leave", 12)).toBe("LV-0012");
    expect(parseRecordNumber("employee", "emp-7")).toBe(7);
  });
});

describe("attendance rules", () => {
  it("converts local wall-clock times in the company time zone", () => {
    expect(at("09:00").toISOString()).toBe("2026-09-28T04:00:00.000Z");
    expect(formatClock(clockMinutes("07:05"))).toBe("07:05");
    // Across a DST change (New York, 8 March 2026): 09:00 local is 13:00 UTC after the switch.
    expect(zonedInstant("2026-03-09", 540, "America/New_York").toISOString()).toBe(
      "2026-03-09T13:00:00.000Z",
    );
  });

  it("is on time within the grace period and late after it (counted from the start)", () => {
    expect(evaluateDay(at("09:10"), null, SCHEDULE, "Asia/Karachi")).toMatchObject({
      status: "PRESENT",
      lateMinutes: 0,
      workedMinutes: null,
    });
    expect(evaluateDay(at("09:11"), null, SCHEDULE, "Asia/Karachi")).toMatchObject({
      status: "LATE",
      lateMinutes: 11,
    });
  });

  it("detects early departure and half days", () => {
    expect(evaluateDay(at("09:00"), at("16:15"), SCHEDULE, "Asia/Karachi")).toEqual({
      status: "PRESENT",
      lateMinutes: 0,
      earlyLeaveMinutes: 45,
      workedMinutes: 435,
    });
    // 3h59m worked → half day, even though the arrival was late (half day wins).
    expect(evaluateDay(at("09:30"), at("13:29"), SCHEDULE, "Asia/Karachi")).toMatchObject({
      status: "HALF_DAY",
      lateMinutes: 30,
      workedMinutes: 239,
    });
    // Exactly the threshold is a full day.
    expect(evaluateDay(at("09:00"), at("13:00"), SCHEDULE, "Asia/Karachi").status).toBe("PRESENT");
    // Leaving after midnight is not an early departure.
    expect(
      evaluateDay(at("09:00"), at("00:30", "2026-09-29"), SCHEDULE, "Asia/Karachi").earlyLeaveMinutes,
    ).toBe(0);
  });

  it("derives absent, on leave and pending days", () => {
    const base = { record: null, onLeave: false, today: "2026-09-28", nowMinutes: 600, schedule: SCHEDULE };
    expect(dayStatus({ ...base, date: "2026-09-25" })).toBe("ABSENT");
    expect(dayStatus({ ...base, date: "2026-09-25", onLeave: true })).toBe("ON_LEAVE");
    expect(dayStatus({ ...base, date: "2026-09-28" })).toBe("PENDING");
    expect(dayStatus({ ...base, date: "2026-09-28", nowMinutes: 17 * 60 })).toBe("ABSENT");
    // A record wins over leave.
    expect(dayStatus({ ...base, date: "2026-09-25", onLeave: true, record: { status: "LATE" } })).toBe(
      "LATE",
    );
  });

  it("counts working days and employment spans", () => {
    // Fri 25 Sep – Tue 29 Sep 2026 with a Mon–Fri week: Fri, Mon, Tue.
    expect(workingDays("2026-09-25", "2026-09-29", SCHEDULE.workDays)).toEqual([
      "2026-09-25",
      "2026-09-28",
      "2026-09-29",
    ]);
    expect(workingDays("2026-09-26", "2026-09-27", SCHEDULE.workDays)).toEqual([]);
    const span = { status: "ACTIVE" as const, joiningDate: "2026-09-01", exitDate: null };
    expect(employedOn(span, "2026-08-31")).toBe(false);
    expect(employedOn(span, "2026-09-01")).toBe(true);
    expect(employedOn({ ...span, status: "RESIGNED", exitDate: "2026-09-10" }, "2026-09-10")).toBe(true);
    expect(employedOn({ ...span, status: "RESIGNED", exitDate: "2026-09-10" }, "2026-09-11")).toBe(false);
    expect(employedOn({ ...span, status: "SUSPENDED" }, "2026-09-15")).toBe(false);
    expect(
      rangesOverlap({ start: "2026-09-01", end: "2026-09-05" }, { start: "2026-09-05", end: "2026-09-06" }),
    ).toBe(true);
    expect(
      rangesOverlap({ start: "2026-09-01", end: "2026-09-04" }, { start: "2026-09-05", end: "2026-09-06" }),
    ).toBe(false);
  });

  it("totals days: late and half days are part of present", () => {
    const totals = emptyTotals();
    addDay(totals, "LATE", { lateMinutes: 12, earlyLeaveMinutes: 0, workedMinutes: 470 });
    addDay(totals, "HALF_DAY", { lateMinutes: 5, earlyLeaveMinutes: 200, workedMinutes: 200 });
    addDay(totals, "ABSENT", null);
    addDay(totals, "ON_LEAVE", null);
    expect(totals).toEqual({
      workingDays: 4,
      present: 2,
      late: 2,
      halfDay: 1,
      absent: 1,
      onLeave: 1,
      pending: 0,
      earlyDepartures: 1,
      workedMinutes: 670,
    });
  });
});

describe("salary and bank protection", () => {
  const key = Buffer.alloc(32, 7);

  it("encrypts with a fresh IV and binds the value to its record and field", () => {
    const context = "company:employee:accountNumber";
    const first = encryptWithKey("0101-2345678901", context, key);
    const second = encryptWithKey("0101-2345678901", context, key);
    expect(first).toMatch(/^v1:/);
    expect(first).not.toBe(second);
    expect(first).not.toContain("2345678901");
    expect(decryptWithKey(first, context, key)).toBe("0101-2345678901");
    expect(() => decryptWithKey(first, "company:other-employee:accountNumber", key)).toThrow();
    expect(() => decryptWithKey(first, context, Buffer.alloc(32, 8))).toThrow();
    const tampered = `${first.slice(0, -2)}${first.endsWith("A") ? "B" : "A"}${first.slice(-1)}`;
    expect(() => decryptWithKey(tampered, context, key)).toThrow();
  });

  it("keeps salary and bank values out of audit snapshots", () => {
    expect(
      toAuditJson({ name: "Sara", salary: "185000.00", accountNumberCipher: "v1:abc", iban: "PK36" }),
    ).toEqual({ name: "Sara", salary: "[redacted]", accountNumberCipher: "[redacted]", iban: "[redacted]" });
  });

  it("validates and normalises bank details", () => {
    expect(compensationSchema.parse({ salary: "185000.5", iban: "pk36 scbl 0000 0011 2345 6702" }).iban).toBe(
      "PK36SCBL0000001123456702",
    );
    expect(compensationSchema.safeParse({ salary: "-1" }).success).toBe(false);
    expect(compensationSchema.safeParse({ salary: "", iban: "not an iban" }).success).toBe(false);
    expect(compensationSchema.safeParse({ salary: "", accountNumber: "12" }).success).toBe(false);
  });
});

describe("HR validation", () => {
  it("validates employees and status changes", () => {
    const employee = {
      name: "Sara Khan",
      joiningDate: "2026-09-01",
      identificationNumber: "35202-1234567-1",
    };
    expect(employeeSchema.safeParse(employee).success).toBe(true);
    expect(employeeSchema.safeParse({ ...employee, identificationNumber: "35202<script>" }).success).toBe(
      false,
    );
    expect(employeeSchema.safeParse({ ...employee, status: "TERMINATED" }).success).toBe(false);
    expect(employeeStatusSchema.safeParse({ status: "RESIGNED" }).success).toBe(false);
    expect(employeeStatusSchema.safeParse({ status: "RESIGNED", exitDate: "2026-09-30" }).success).toBe(true);
  });

  it("validates attendance entries and leave requests", () => {
    const entry = { employeeId: "0190a0a0-0000-7000-8000-000000000001", date: "2026-09-28", absent: false };
    expect(attendanceEntrySchema.safeParse({ ...entry, checkIn: "", checkOut: "" }).success).toBe(false);
    expect(attendanceEntrySchema.safeParse({ ...entry, checkIn: "09:00", checkOut: "08:00" }).success).toBe(
      false,
    );
    expect(attendanceEntrySchema.safeParse({ ...entry, checkIn: "09:00", checkOut: "" }).success).toBe(true);
    expect(
      attendanceEntrySchema.safeParse({ ...entry, absent: true, checkIn: "", checkOut: "" }).success,
    ).toBe(true);
    const leave = { type: "SICK", startDate: "2026-09-28", endDate: "2026-09-27", reason: "Flu" };
    expect(leaveSchema.safeParse(leave).success).toBe(false);
    expect(leaveSchema.safeParse({ ...leave, endDate: "2026-09-29" }).success).toBe(true);
  });

  it("validates the work schedule", () => {
    const schedule = {
      workdayStart: "09:00",
      workdayEnd: "17:00",
      lateGraceMinutes: 10,
      halfDayMinutes: 240,
      workDays: [1],
    };
    expect(workScheduleSchema.safeParse(schedule).success).toBe(true);
    expect(workScheduleSchema.safeParse({ ...schedule, workdayEnd: "08:00" }).success).toBe(false);
    expect(workScheduleSchema.safeParse({ ...schedule, workDays: [] }).success).toBe(false);
  });
});
