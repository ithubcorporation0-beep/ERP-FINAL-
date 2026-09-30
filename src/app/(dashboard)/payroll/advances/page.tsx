import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { WORKFORCE_STATUSES } from "@/config/hr";
import { periodLabel, SALARY_ADVANCE_STATUS_LABELS } from "@/config/payroll";
import { formatRecordNumber } from "@/config/records";
import { PAYMENT_METHOD_LABELS } from "@/config/sales";
import { AdvanceDialog, CancelAdvanceButton } from "@/features/payroll/advance-dialog";
import { ADVANCE_STATUS_TONES } from "@/features/payroll/labels";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/tenant";
import { employeeService } from "@/server/services/employee.service";
import { salaryAdvanceService } from "@/server/services/salary-advance.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Salary advances" };

export default async function AdvancesPage() {
  const ctx = await authorizePage("payroll:view");
  if (!ctx) return <AccessDenied />;
  const canCreate = can(ctx, "payroll:create") && can(ctx, "employees:view");
  const [advances, company, employees] = await Promise.all([
    salaryAdvanceService.list(ctx),
    salesContext(ctx),
    canCreate ? employeeService.options(ctx) : Promise.resolve([]),
  ]);
  const format = { locale: company.locale, currency: company.currency };
  const canCancel = can(ctx, "payroll:delete");

  return (
    <>
      <PageHeader
        title="Salary advances"
        description="Money paid to employees ahead of payroll. Each advance is recovered in full by the next payroll with room for it."
        actions={
          canCreate ? (
            <AdvanceDialog
              today={company.today}
              employees={employees
                .filter((employee) => WORKFORCE_STATUSES.includes(employee.status))
                .map((employee) => ({
                  value: employee.id,
                  label: `${employee.name} (${formatRecordNumber("employee", employee.number)})`,
                }))}
            />
          ) : undefined
        }
      />
      <Card className="shadow-xs">
        <CardContent>
          {advances.length === 0 ? (
            <EmptyState size="compact" icon={Banknote} title="No salary advances" />
          ) : (
            <Table>
              <TableCaption className="sr-only">Salary advances</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Advance</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.map((advance) => {
                  const code = formatRecordNumber("advance", advance.number);
                  return (
                    <TableRow key={advance.id}>
                      <TableCell className="font-mono text-xs">{code}</TableCell>
                      <TableCell>{advance.employee.name}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatCalendarDate(advance.advanceDate, company)}
                        <span className="block text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[advance.paymentMethod]}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-64 truncate">{advance.reason}</TableCell>
                      <TableCell className="text-right whitespace-nowrap" data-numeric>
                        {formatMoney(advance.amount, format)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={ADVANCE_STATUS_TONES[advance.status]}>
                          {SALARY_ADVANCE_STATUS_LABELS[advance.status]}
                        </StatusBadge>
                        {advance.recoveredRun ? (
                          <Link
                            href={`/payroll/runs/${advance.recoveredRun.id}`}
                            className="block text-xs text-primary hover:underline"
                          >
                            {periodLabel(advance.recoveredRun.periodYear, advance.recoveredRun.periodMonth)}
                          </Link>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {canCancel && advance.status === "OUTSTANDING" ? (
                          <CancelAdvanceButton id={advance.id} code={code} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
