import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/config/hr";
import { formatRecordNumber } from "@/config/records";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { LEAVE_STATUS_TONES } from "@/features/hr/labels";
import { LeaveActions } from "@/features/hr/leave-actions";
import { dayCount } from "@/features/hr/leave-rows";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDateTime } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { leaveService } from "@/server/services/leave.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Leave request" };

export default async function LeaveRequestPage({ params }: PageProps<"/hr/leave/[id]">) {
  const ctx = await authorizePage("leaves:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const leave = await orNotFound(leaveService.get(ctx, id));
  const [history, company] = await Promise.all([leaveService.history(ctx, id), salesContext(ctx)]);
  const format = { locale: company.locale, timeZone: company.timeZone, currency: company.currency };
  const code = formatRecordNumber("leave", leave.number);

  return (
    <>
      <PageHeader
        title={`Leave request ${code}`}
        description={`${leave.employee.name} · ${LEAVE_TYPE_LABELS[leave.type]}`}
      />
      <div className="mb-4">
        <StatusBadge tone={LEAVE_STATUS_TONES[leave.status]}>{LEAVE_STATUS_LABELS[leave.status]}</StatusBadge>
      </div>
      <div className="mb-6">
        <LeaveActions
          id={id}
          code={code}
          hasAttachment={leave.attachmentKey !== null}
          can={leaveService.abilities(ctx, leave)}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
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
                  label: "Employee",
                  value: can(ctx, "employees:view") ? (
                    <Link
                      href={`/hr/employees/${leave.employee.id}`}
                      className="text-primary hover:underline"
                    >
                      {leave.employee.name}
                    </Link>
                  ) : (
                    leave.employee.name
                  ),
                },
                { label: "Leave type", value: LEAVE_TYPE_LABELS[leave.type] },
                { label: "Start date", value: formatCalendarDate(leave.startDate, company) },
                { label: "End date", value: formatCalendarDate(leave.endDate, company) },
                { label: "Working days", value: dayCount(leave.days) },
                { label: "Attachment", value: leave.attachmentName ?? "None" },
                { label: "Requested by", value: leave.createdBy?.name },
                { label: "Requested on", value: formatDateTime(leave.createdAt, format) },
              ]}
            />
            <div className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Reason</p>
              <p className="mt-1 text-sm whitespace-pre-line">{leave.reason}</p>
            </div>
            {leave.decidedAt ? (
              <div className="mt-4">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {LEAVE_STATUS_LABELS[leave.status]} by {leave.decidedBy?.name ?? "—"} on{" "}
                  {formatDateTime(leave.decidedAt, format)}
                </p>
                <p className="mt-1 text-sm whitespace-pre-line">{leave.decisionNote ?? "No note."}</p>
              </div>
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
    </>
  );
}
