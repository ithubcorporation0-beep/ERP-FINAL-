import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRecordNumber } from "@/config/records";
import { RangeFilter } from "@/features/dashboard/range-filter";
import { describeSchedule } from "@/features/hr/attendance-rows";
import { formatDuration } from "@/features/hr/labels";
import type { AttendanceTotals } from "@/lib/attendance";
import { authorizePage } from "@/lib/auth/page";
import { attendanceReportQuerySchema } from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";

export const metadata: Metadata = { title: "Attendance report" };

const COLUMNS: Array<{ key: keyof AttendanceTotals; label: string }> = [
  { key: "workingDays", label: "Working days" },
  { key: "present", label: "Present" },
  { key: "late", label: "Late" },
  { key: "halfDay", label: "Half days" },
  { key: "earlyDepartures", label: "Early departures" },
  { key: "absent", label: "Absent" },
  { key: "onLeave", label: "On leave" },
];

function Cells({ totals }: { totals: AttendanceTotals }) {
  return (
    <>
      {COLUMNS.map((column) => (
        <TableCell key={column.key} className="text-right" data-numeric>
          {totals[column.key]}
        </TableCell>
      ))}
      <TableCell className="text-right whitespace-nowrap" data-numeric>
        {formatDuration(totals.workedMinutes)}
      </TableCell>
    </>
  );
}

export default async function AttendanceReportPage({ searchParams }: PageProps<"/hr/attendance/report">) {
  const ctx = await authorizePage("attendance:view");
  if (!ctx) return <AccessDenied />;
  if (!attendanceService.seesAll(ctx)) return <AccessDenied />;
  const query = attendanceReportQuerySchema.parse(await searchParams);
  const report = await attendanceService.report(ctx, query);

  return (
    <>
      <PageHeader
        title="Attendance report"
        description={`Working days ${report.period.from} to ${report.period.to} (up to today). ${describeSchedule(report.schedule)}.`}
        actions={<RangeFilter value={query.range} />}
      />
      <p className="mb-4 text-sm">
        <Link href="/hr/attendance" className="text-primary hover:underline">
          ← Attendance
        </Link>
      </p>
      <Card className="shadow-xs">
        <CardContent>
          {report.rows.length === 0 ? (
            <EmptyState
              size="compact"
              title="No working days to report"
              description="No employees were expected at work in this period."
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Attendance per employee</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  {COLUMNS.map((column) => (
                    <TableHead key={column.key} className="text-right">
                      {column.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Worked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow key={row.employee.id}>
                    <TableCell>
                      <Link
                        href={`/hr/attendance?employeeId=${row.employee.id}&range=${query.range}`}
                        className="hover:underline"
                      >
                        {row.employee.name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {formatRecordNumber("employee", row.employee.number)}
                      </span>
                    </TableCell>
                    <Cells totals={row.totals} />
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>All employees</TableCell>
                  <Cells totals={report.totals} />
                </TableRow>
              </TableFooter>
            </Table>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Present includes late arrivals and half days. A working day without a record counts as absent once
            it is over, unless approved leave covers it. Today counts as “not checked in yet” until the
            working day ends.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
