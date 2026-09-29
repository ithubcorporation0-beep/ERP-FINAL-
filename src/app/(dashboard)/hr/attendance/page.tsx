import type { Metadata } from "next";
import { CalendarCheck, CalendarX, Clock, Plane, Plus, Users } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DAY_STATUS_LABELS } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import { AttendanceClock } from "@/features/hr/attendance-clock";
import { AttendanceHistory } from "@/features/hr/attendance-history";
import { attendanceRow, describeSchedule } from "@/features/hr/attendance-rows";
import { DAY_STATUS_TONES, formatDuration } from "@/features/hr/labels";
import { authorizePage } from "@/lib/auth/page";
import { formatTime } from "@/lib/format";
import { can } from "@/lib/tenant";
import { attendanceListQuerySchema } from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";
import { employeeService } from "@/server/services/employee.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: PageProps<"/hr/attendance">) {
  const ctx = await authorizePage("attendance:view");
  if (!ctx) return <AccessDenied />;
  const query = attendanceListQuerySchema
    .catch(attendanceListQuerySchema.parse({}))
    .parse(await searchParams);
  const seesAll = attendanceService.seesAll(ctx);
  const canEdit = can(ctx, "attendance:edit");
  const [company, mine, history, today, employees] = await Promise.all([
    salesContext(ctx),
    attendanceService.myDay(ctx),
    attendanceService.list(ctx, query),
    seesAll ? attendanceService.today(ctx) : null,
    seesAll && can(ctx, "employees:view") ? employeeService.options(ctx) : Promise.resolve([]),
  ]);
  const format = { locale: company.locale, timeZone: company.timeZone };
  const record = mine.record;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description={
          seesAll ? "Today's attendance, history and reports." : "Your check-ins and attendance history."
        }
        actions={
          <>
            {seesAll ? (
              <Button asChild variant="outline">
                <Link href="/hr/attendance/report">Attendance report</Link>
              </Button>
            ) : null}
            {canEdit ? (
              <Button asChild>
                <Link href="/hr/attendance/new">
                  <Plus aria-hidden="true" />
                  Record attendance
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {mine.employee || can(ctx, "attendance:create") ? (
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle>
              <h2>My attendance today</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mine.employee ? (
              <AttendanceClock
                checkIn={record?.checkInAt ? formatTime(record.checkInAt, format) : null}
                checkOut={record?.checkOutAt ? formatTime(record.checkOutAt, format) : null}
                status={record ? record.status : null}
                detail={
                  record
                    ? [
                        record.lateMinutes > 0 ? `${formatDuration(record.lateMinutes)} late` : null,
                        record.earlyLeaveMinutes > 0
                          ? `left ${formatDuration(record.earlyLeaveMinutes)} early`
                          : null,
                        record.workedMinutes !== null
                          ? `worked ${formatDuration(record.workedMinutes)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    : "You haven't checked in today."
                }
                schedule={`${describeSchedule(mine.schedule)} (${mine.timeZone})`}
                canCheckIn={mine.canCheckIn}
                canCheckOut={mine.canCheckOut}
              />
            ) : (
              <p className="text-sm text-muted-foreground" role="status">
                Your login isn&apos;t linked to an employee record yet, so you can&apos;t check in. Ask HR to
                link it on your employee profile.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {today ? (
        <section aria-labelledby="today-heading" className="space-y-4">
          <h2 id="today-heading" className="text-lg font-semibold">
            Today
          </h2>
          {today.workingDay ? null : (
            <p className="text-sm text-muted-foreground" role="status">
              Today isn&apos;t a working day in the company schedule.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard label="Present" value={String(today.present)} icon={CalendarCheck} />
            <KpiCard
              label="Absent"
              value={String(today.absent)}
              icon={CalendarX}
              hint="Not checked in (and not on leave)"
            />
            <KpiCard label="Late" value={String(today.late)} icon={Clock} />
            <KpiCard label="On leave" value={String(today.onLeave)} icon={Plane} />
            <KpiCard label="Total employees" value={String(today.totalEmployees)} icon={Users} />
          </div>
          {today.rows.length > 0 ? (
            <Card className="shadow-xs">
              <CardContent>
                <Table>
                  <TableCaption className="sr-only">Today&apos;s attendance by employee</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {today.rows.map((row) => (
                      <TableRow key={row.employee.id}>
                        <TableCell>
                          <span className="mr-2 font-mono text-xs text-muted-foreground">
                            {formatRecordNumber("employee", row.employee.number)}
                          </span>
                          {row.employee.name}
                        </TableCell>
                        <TableCell>{row.employee.department?.name ?? "—"}</TableCell>
                        <TableCell>
                          {row.record?.checkInAt ? formatTime(row.record.checkInAt, format) : "—"}
                          {row.lateMinutes > 0 ? (
                            <span className="ml-1 text-xs text-warning">
                              ({formatDuration(row.lateMinutes)} late)
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {row.record?.checkOutAt ? formatTime(row.record.checkOutAt, format) : "—"}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={DAY_STATUS_TONES[row.status]}>
                            {DAY_STATUS_LABELS[row.status]}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="history-heading" className="space-y-4">
        <h2 id="history-heading" className="text-lg font-semibold">
          History
        </h2>
        <AttendanceHistory
          rows={history.items.map((item) => attendanceRow(item, format, canEdit))}
          total={history.total}
          page={history.page}
          pageSize={history.pageSize}
          range={query.range}
          employees={employees.map((employee) => ({
            value: employee.id,
            label: `${employee.name} (${formatRecordNumber("employee", employee.number)})`,
          }))}
          canDelete={can(ctx, "attendance:delete")}
        />
      </section>
    </div>
  );
}
