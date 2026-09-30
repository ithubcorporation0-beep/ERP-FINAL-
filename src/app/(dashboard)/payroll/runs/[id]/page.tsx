import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYROLL_STATUS_LABELS } from "@/config/payroll";
import { formatRecordNumber } from "@/config/records";
import { PAYMENT_METHOD_LABELS } from "@/config/sales";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { PAYROLL_STATUS_TONES } from "@/features/payroll/labels";
import { PayrollRunActions } from "@/features/payroll/payroll-run-actions";
import { PayslipTable } from "@/features/payroll/payslip-table";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { accountingService } from "@/server/services/accounting.service";
import { itemAmounts, payrollService } from "@/server/services/payroll.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Payroll run" };

export default async function PayrollRunPage({ params }: PageProps<"/payroll/runs/[id]">) {
  const ctx = await authorizePage("payroll:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const { run, items, totals, label } = await orNotFound(payrollService.detail(ctx, id));
  const seesLedger = can(ctx, "accounting:view");
  const [history, company, postings] = await Promise.all([
    payrollService.history(ctx, id),
    salesContext(ctx),
    seesLedger ? accountingService.entriesForSource(ctx, "PAYROLL", id) : Promise.resolve([]),
  ]);
  const format = { locale: company.locale, timeZone: company.timeZone, currency: run.currency };
  const code = formatRecordNumber("payroll", run.number);
  const show = (value: string) => formatMoney(value, format) ?? value;
  const abilities = payrollService.abilities(ctx, run);

  return (
    <>
      <PageHeader
        title={`Payroll ${code}`}
        description={`${label} · pay date ${formatCalendarDate(run.payDate, company)}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge tone={PAYROLL_STATUS_TONES[run.status]}>{PAYROLL_STATUS_LABELS[run.status]}</StatusBadge>
        <span className="text-sm" data-numeric>
          Net total: <strong>{show(totals.net)}</strong>
        </span>
      </div>
      <div className="mb-6">
        <PayrollRunActions
          id={id}
          code={code}
          label={label}
          today={company.today}
          net={show(totals.net)}
          processedByYou={run.createdById === ctx.userId}
          can={abilities}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Payslips</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PayslipTable
                runId={id}
                currency={run.currency}
                locale={company.locale}
                canEdit={abilities.edit}
                slips={run.status !== "CANCELLED"}
                totals={totals}
                rows={items.map((item) => ({
                  id: item.id,
                  code: formatRecordNumber("employee", item.employeeNumber),
                  name: item.employeeName,
                  detail: [item.position, item.departmentName].filter(Boolean).join(" · "),
                  partialPeriod: item.partialPeriod,
                  note: item.note,
                  amounts: itemAmounts(item),
                }))}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Net salary = Basic + Allowances + Bonus + Overtime − Deductions − Tax − Advances. Gross{" "}
                {show(totals.gross)}, deductions {show(totals.totalDeductions)}.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  {
                    label: "Period",
                    value: `${formatCalendarDate(run.periodStart, company)} – ${formatCalendarDate(run.periodEnd, company)}`,
                  },
                  { label: "Processed by", value: run.createdBy?.name },
                  {
                    label: "Approved",
                    value: run.approvedAt
                      ? `${run.approvedBy?.name ?? "—"}, ${formatDateTime(run.approvedAt, format)}`
                      : null,
                  },
                  {
                    label: "Paid",
                    value: run.paidAt
                      ? `${formatCalendarDate(run.paidAt, company)}${run.paidMethod ? ` · ${PAYMENT_METHOD_LABELS[run.paidMethod]}` : ""}`
                      : null,
                  },
                  { label: "Review note", value: run.reviewNote },
                  { label: "Cancelled because", value: run.cancelReason },
                  { label: "Notes", value: run.notes },
                ]}
              />
              {postings.length > 0 ? (
                <p className="mt-4 text-sm">
                  Posted as{" "}
                  {postings.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/finance/transactions/${entry.id}`}
                      className="font-mono text-primary hover:underline"
                    >
                      {formatRecordNumber("journal", entry.number)}
                    </Link>
                  ))}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card className="h-fit shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>History</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HistoryList
                items={history.map((entry) => ({
                  ...entry,
                  at: entry.at.toISOString(),
                  atLabel: formatDateTime(entry.at, format),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
