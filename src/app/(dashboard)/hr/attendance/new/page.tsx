import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { AttendanceEntryForm } from "@/features/hr/attendance-entry-form";
import { formatClock, localClock } from "@/lib/attendance";
import { authorizePage } from "@/lib/auth/page";
import { attendancePrefillSchema } from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";
import { employeeService } from "@/server/services/employee.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Record attendance" };

export default async function RecordAttendancePage({ searchParams }: PageProps<"/hr/attendance/new">) {
  const ctx = await authorizePage("attendance:edit");
  if (!ctx) return <AccessDenied />;
  const prefill = attendancePrefillSchema.parse(await searchParams);
  const [employees, company] = await Promise.all([employeeService.options(ctx), salesContext(ctx)]);
  const date = prefill.date ?? company.today;
  // Correcting an existing day starts from its current values.
  const existing = prefill.employeeId ? await attendanceService.findDay(ctx, prefill.employeeId, date) : null;
  const time = (value: Date | null | undefined) =>
    value ? formatClock(localClock(value, company.timeZone).minutes) : "";

  return (
    <>
      <PageHeader
        title={existing ? "Correct attendance" : "Record attendance"}
        description="Enter a day for an employee, or correct one. Every change is kept in the audit log."
      />
      <Card className="shadow-xs">
        <CardContent>
          <AttendanceEntryForm
            timeZone={company.timeZone}
            employees={employees.map((employee) => ({
              value: employee.id,
              label: `${employee.name} (${formatRecordNumber("employee", employee.number)})`,
            }))}
            defaults={{
              employeeId: prefill.employeeId ?? "",
              date,
              absent: existing?.status === "ABSENT",
              checkIn: time(existing?.checkInAt),
              checkOut: time(existing?.checkOutAt),
              note: "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
