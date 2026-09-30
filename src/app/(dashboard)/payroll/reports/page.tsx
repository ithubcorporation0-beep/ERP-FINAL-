import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { PAYROLL_LINE_LABELS } from "@/config/payroll";
import { formatRecordNumber } from "@/config/records";
import { RangeFilter } from "@/features/dashboard/range-filter";
import { authorizePage } from "@/lib/auth/page";
import { formatMoney } from "@/lib/format";
import type { PayrollResult } from "@/lib/payroll";
import { payrollReportQuerySchema } from "@/lib/validation";
import { payrollService } from "@/server/services/payroll.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Payroll reports" };

const COLUMNS = ["gross", "deductions", "tax", "advances", "net"] as const;
const HEADERS: Record<(typeof COLUMNS)[number], string> = {
  gross: "Gross pay",
  deductions: PAYROLL_LINE_LABELS.deductions,
  tax: PAYROLL_LINE_LABELS.tax,
  advances: PAYROLL_LINE_LABELS.advances,
  net: PAYROLL_LINE_LABELS.net,
};

function ReportTable({
  title,
  first,
  rows,
  totals,
  show,
}: {
  title: string;
  first: string;
  rows: Array<{ key: string; label: React.ReactNode; count: number; totals: PayrollResult }>;
  totals: PayrollResult;
  show: (value: string) => string;
}) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableCaption className="sr-only">{title}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{first}</TableHead>
              <TableHead className="text-right">Payslips</TableHead>
              {COLUMNS.map((column) => (
                <TableHead key={column} className="text-right whitespace-nowrap">
                  {HEADERS[column]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="text-right">{row.count}</TableCell>
                {COLUMNS.map((column) => (
                  <TableCell key={column} className="text-right whitespace-nowrap" data-numeric>
                    {show(row.totals[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{rows.reduce((sum, row) => sum + row.count, 0)}</TableCell>
              {COLUMNS.map((column) => (
                <TableCell key={column} className="text-right whitespace-nowrap" data-numeric>
                  {show(totals[column])}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function PayrollReportsPage({ searchParams }: PageProps<"/payroll/reports">) {
  const ctx = await authorizePage("payroll:view");
  if (!ctx) return <AccessDenied />;
  const { range } = payrollReportQuerySchema.parse(await searchParams);
  const [report, company] = await Promise.all([payrollService.report(ctx, range), salesContext(ctx)]);
  const show = (value: string) =>
    formatMoney(value, { locale: company.locale, currency: company.currency }) ?? value;

  return (
    <>
      <PageHeader
        title="Payroll reports"
        description={`Approved and paid payroll for ${report.period}. Tax is what was withheld on payslips.`}
        actions={<RangeFilter value={range} />}
      />
      {report.runs.length === 0 ? (
        <EmptyState
          title="No approved payroll in this period"
          description="Approved and paid runs appear here."
        />
      ) : (
        <div className="space-y-4">
          <ReportTable
            title="By month"
            first="Payroll"
            show={show}
            totals={report.totals}
            rows={report.runs.map((row) => ({
              key: row.run.id,
              label: (
                <Link href={`/payroll/runs/${row.run.id}`} className="hover:underline">
                  {row.label}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatRecordNumber("payroll", row.run.number)}
                  </span>
                </Link>
              ),
              count: row.employees,
              totals: row.totals,
            }))}
          />
          <ReportTable
            title="By department"
            first="Department"
            show={show}
            totals={report.totals}
            rows={report.departments.map((row) => ({
              key: row.name,
              label: row.name,
              count: row.payslips,
              totals: row.totals,
            }))}
          />
          <ReportTable
            title="By employee"
            first="Employee"
            show={show}
            totals={report.totals}
            rows={report.employees.map((row) => ({
              key: row.employeeId,
              label: (
                <Link href={`/hr/employees/${row.employeeId}`} className="hover:underline">
                  {row.name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatRecordNumber("employee", row.number)}
                  </span>
                </Link>
              ),
              count: row.payslips,
              totals: row.totals,
            }))}
          />
        </div>
      )}
    </>
  );
}
