import type { Metadata } from "next";
import { PAYROLL_STATUS_LABELS, periodLabel } from "@/config/payroll";
import { PAYROLL_STATUS_TONES } from "@/features/payroll/labels";
import { SalaryStructurePanel } from "@/features/payroll/salary-structure-panel";
import { money } from "@/lib/money";
import { payrollService } from "@/server/services/payroll.service";
import { salaryStructureService } from "@/server/services/salary-structure.service";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EMPLOYMENT_STATUS_LABELS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import { DetailList } from "@/features/crm/detail-list";
import { DocumentPanel } from "@/features/crm/document-panel";
import { HistoryList } from "@/features/crm/history-list";
import { CompensationPanel } from "@/features/hr/compensation-panel";
import { EmployeeAvatar } from "@/features/hr/employee-avatar";
import { EmployeeToolbar } from "@/features/hr/employee-toolbar";
import { EMPLOYMENT_STATUS_TONES, LEAVE_STATUS_TONES, formatDuration } from "@/features/hr/labels";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { formatBytes, formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { leaveListQuerySchema } from "@/lib/validation";
import { attendanceService } from "@/server/services/attendance.service";
import { compensationService } from "@/server/services/compensation.service";
import { employeeDocumentService } from "@/server/services/employee-document.service";
import { employeeService } from "@/server/services/employee.service";
import { leaveService } from "@/server/services/leave.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Employee" };

export default async function EmployeePage({ params }: PageProps<"/hr/employees/[id]">) {
  const ctx = await authorizePage("employees:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const employee = await orNotFound(employeeService.get(ctx, id));
  const sees = {
    // Salary and bank details are loaded only for people allowed to see them — never sent otherwise.
    pay: can(ctx, "salaries:view"),
    attendance: can(ctx, "attendance:view"),
    leave: can(ctx, "leaves:view"),
    payroll: can(ctx, "payroll:view"),
  };
  const [company, documents, history, pay, attendance, leaves, structure, payslips] = await Promise.all([
    salesContext(ctx),
    employeeDocumentService.list(ctx, id),
    employeeService.history(ctx, id),
    sees.pay ? compensationService.get(ctx, id) : null,
    sees.attendance ? attendanceService.recentSummary(ctx, id) : null,
    sees.leave ? leaveService.list(ctx, leaveListQuerySchema.parse({ employeeId: id, pageSize: 10 })) : null,
    sees.pay ? salaryStructureService.get(ctx, id) : null,
    sees.payroll ? payrollService.employeeHistory(ctx, id) : null,
  ]);
  const format = { locale: company.locale, timeZone: company.timeZone, currency: company.currency };
  const showPay = (value: string) =>
    formatMoney(value, { ...format, currency: pay?.currency ?? company.currency }) ?? value;
  const code = formatRecordNumber("employee", employee.number);
  const canEdit = can(ctx, "employees:edit");

  return (
    <>
      <PageHeader title={employee.name} description={[code, employee.position].filter(Boolean).join(" · ")} />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <EmployeeAvatar
          size="lg"
          name={employee.name}
          photoUrl={
            employee.photoKey
              ? `/api/employees/${id}/photo?v=${employee.photoUpdatedAt?.getTime() ?? 0}`
              : null
          }
        />
        <div className="space-y-2">
          <StatusBadge tone={EMPLOYMENT_STATUS_TONES[employee.status]}>
            {EMPLOYMENT_STATUS_LABELS[employee.status]}
          </StatusBadge>
          {employee.exitDate ? (
            <p className="text-sm text-muted-foreground">
              Last working day: {formatCalendarDate(employee.exitDate, company)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mb-6">
        <EmployeeToolbar
          id={id}
          name={employee.name}
          status={employee.status}
          exitDate={employee.exitDate ? dateToDateOnly(employee.exitDate) : null}
          hasPhoto={employee.photoKey !== null}
          today={company.today}
          can={{ edit: canEdit, delete: can(ctx, "employees:delete") }}
        />
      </div>

      <Tabs defaultValue="overview">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {pay ? <TabsTrigger value="pay">Salary & bank</TabsTrigger> : null}
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
            {attendance ? <TabsTrigger value="attendance">Attendance</TabsTrigger> : null}
            {leaves ? <TabsTrigger value="leave">Leave ({leaves.total})</TabsTrigger> : null}
            {payslips ? <TabsTrigger value="payroll">Payroll ({payslips.length})</TabsTrigger> : null}
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Profile</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Employee ID", value: <span className="font-mono">{code}</span> },
                  { label: "CNIC / identification", value: employee.identificationNumber },
                  {
                    label: "Email",
                    value: employee.email ? (
                      <a className="text-primary hover:underline" href={`mailto:${employee.email}`}>
                        {employee.email}
                      </a>
                    ) : null,
                  },
                  { label: "Phone", value: employee.phone },
                  {
                    label: "Login",
                    value: employee.user ? `${employee.user.name} (${employee.user.email})` : "Not linked",
                  },
                  { label: "Notes", value: employee.notes },
                ]}
              />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Employment</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList
                  items={[
                    { label: "Department", value: employee.department?.name },
                    { label: "Position", value: employee.position },
                    { label: "Joining date", value: formatCalendarDate(employee.joiningDate, company) },
                    { label: "Status", value: EMPLOYMENT_STATUS_LABELS[employee.status] },
                  ]}
                />
              </CardContent>
            </Card>
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Emergency contact</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DetailList
                  items={[
                    { label: "Name", value: employee.emergencyContactName },
                    { label: "Relationship", value: employee.emergencyContactRelation },
                    { label: "Phone", value: employee.emergencyContactPhone },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {pay ? (
          <TabsContent value="pay">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Salary and bank details</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CompensationPanel
                  employeeId={id}
                  canEdit={can(ctx, "salaries:edit")}
                  view={{
                    salary: pay.salary ?? "",
                    salaryLabel: pay.salary
                      ? formatMoney(pay.salary, { ...format, currency: pay.currency })
                      : null,
                    currency: pay.currency,
                    bankName: pay.bankName,
                    accountTitle: pay.accountTitle,
                    accountNumber: pay.accountNumber,
                    iban: pay.iban,
                    updated: pay.updatedAt
                      ? `${formatDateTime(pay.updatedAt, format)}${pay.updatedBy ? ` by ${pay.updatedBy}` : ""}`
                      : null,
                  }}
                />
              </CardContent>
            </Card>
            {structure ? (
              <Card className="mt-4 shadow-xs">
                <CardHeader>
                  <CardTitle>
                    <h2>Salary structure</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SalaryStructurePanel
                    employeeId={id}
                    canEdit={can(ctx, "salaries:edit")}
                    summary={{
                      basic: structure.basic ? showPay(structure.basic) : "Not set — add it above",
                      allowances: showPay(structure.preview.allowances),
                      deductions: showPay(structure.preview.deductions),
                      tax: showPay(structure.preview.tax),
                      net: showPay(structure.preview.net),
                    }}
                    components={structure.components.map((component) => ({
                      id: component.id,
                      kind: component.kind,
                      name: component.name,
                      amount: component.amount,
                      amountLabel: showPay(component.amount),
                      isActive: component.isActive,
                    }))}
                  />
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>
        ) : null}

        {payslips ? (
          <TabsContent value="payroll">
            <Card className="shadow-xs">
              <CardContent>
                {payslips.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No approved or paid payroll yet.</p>
                ) : (
                  <ul className="divide-y" aria-label="Payroll history">
                    {payslips.map((slip) => (
                      <li key={slip.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                        <Link href={`/payroll/runs/${slip.run.id}`} className="font-medium hover:underline">
                          {periodLabel(slip.run.periodYear, slip.run.periodMonth, company.locale)}
                        </Link>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatRecordNumber("payroll", slip.run.number)}
                        </span>
                        <StatusBadge tone={PAYROLL_STATUS_TONES[slip.run.status]}>
                          {PAYROLL_STATUS_LABELS[slip.run.status]}
                        </StatusBadge>
                        <span className="ml-auto" data-numeric>
                          Net{" "}
                          <strong>
                            {formatMoney(money(slip.net), { ...format, currency: slip.run.currency })}
                          </strong>
                        </span>
                        <a
                          href={`/api/payroll/${slip.run.id}/items/${slip.id}/slip?download=1`}
                          className="text-primary hover:underline"
                        >
                          Salary slip
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="documents">
          <DocumentPanel
            endpoint={`/api/employees/${id}/documents`}
            canEdit={canEdit}
            documents={documents.map((document) => ({
              id: document.id,
              name: document.name,
              sizeLabel: formatBytes(document.sizeBytes, format),
              uploadedBy: document.createdBy?.name ?? null,
              uploadedAt: document.createdAt.toISOString(),
              uploadedAtLabel: formatDateTime(document.createdAt, format),
            }))}
          />
        </TabsContent>

        {attendance ? (
          <TabsContent value="attendance">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Last 30 days</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailList
                  items={[
                    { label: "Working days", value: String(attendance.workingDays) },
                    { label: "Present", value: String(attendance.present) },
                    { label: "Late", value: String(attendance.late) },
                    { label: "Half days", value: String(attendance.halfDay) },
                    { label: "Early departures", value: String(attendance.earlyDepartures) },
                    { label: "Absent", value: String(attendance.absent) },
                    { label: "On leave", value: String(attendance.onLeave) },
                    { label: "Worked", value: formatDuration(attendance.workedMinutes) },
                  ]}
                />
                <Link
                  href={`/hr/attendance?employeeId=${id}`}
                  className="text-sm text-primary hover:underline"
                >
                  Open attendance history
                </Link>
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        {leaves ? (
          <TabsContent value="leave">
            <Card className="shadow-xs">
              <CardContent>
                {leaves.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No leave requests.</p>
                ) : (
                  <ul className="divide-y" aria-label="Leave requests">
                    {leaves.items.map((leave) => (
                      <li key={leave.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                        <Link href={`/hr/leave/${leave.id}`} className="font-mono text-xs hover:underline">
                          {formatRecordNumber("leave", leave.number)}
                        </Link>
                        <span>{LEAVE_TYPE_LABELS[leave.type]}</span>
                        <span className="text-muted-foreground">
                          {formatCalendarDate(leave.startDate, company)} –{" "}
                          {formatCalendarDate(leave.endDate, company)} · {leave.days}{" "}
                          {leave.days === 1 ? "day" : "days"}
                        </span>
                        <StatusBadge tone={LEAVE_STATUS_TONES[leave.status]}>
                          {LEAVE_STATUS_LABELS[leave.status]}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="history">
          <Card className="shadow-xs">
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
        </TabsContent>
      </Tabs>
    </>
  );
}
