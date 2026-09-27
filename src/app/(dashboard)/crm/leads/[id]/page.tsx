import type { Metadata } from "next";
import { FileText, Pencil } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRecordNumber, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS } from "@/config/crm";
import { DeleteRecordButton } from "@/features/crm/delete-record-button";
import { DetailList } from "@/features/crm/detail-list";
import { formatCalendarDate, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { HistoryList } from "@/features/crm/history-list";
import { LEAD_STATUS_TONES } from "@/features/crm/labels";
import { ConvertLeadButton, LeadStageControl } from "@/features/crm/lead-actions";
import { companyToday, isFollowUpOverdue } from "@/features/crm/lead-view";
import { authorizePage } from "@/lib/auth/page";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { deleteLeadAction } from "@/server/actions/lead.actions";
import { companyService } from "@/server/services/company.service";
import { leadService } from "@/server/services/lead.service";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadPage({ params }: PageProps<"/crm/leads/[id]">) {
  const ctx = await authorizePage("leads:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const lead = await orNotFound(leadService.get(ctx, id));
  const [format, history] = await Promise.all([companyService.formatting(ctx), leadService.history(ctx, id)]);
  const canEdit = can(ctx, "leads:edit");
  const canConvert = canEdit && can(ctx, "customers:create") && !lead.customerId;
  const code = formatRecordNumber("lead", lead.number);
  const overdue = isFollowUpOverdue(lead, companyToday(format.timeZone));

  return (
    <>
      <PageHeader
        title={lead.name}
        description={[code, lead.companyName].filter(Boolean).join(" · ")}
        actions={
          <>
            {canConvert ? <ConvertLeadButton id={id} name={lead.name} /> : null}
            {lead.customer && !lead.customer.deletedAt && can(ctx, "quotations:create") ? (
              <Button asChild variant="outline">
                <Link href={`/sales/quotations/new?customerId=${lead.customer.id}&leadId=${id}`}>
                  <FileText aria-hidden="true" />
                  Create quotation
                </Link>
              </Button>
            ) : null}
            {canEdit ? (
              <Button asChild variant="outline">
                <Link href={`/crm/leads/${id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {can(ctx, "leads:delete") ? (
              <DeleteRecordButton
                noun="lead"
                name={lead.name}
                action={deleteLeadAction.bind(null, id)}
                redirectTo="/crm/leads"
              />
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Pipeline</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LeadStageControl id={id} status={lead.status} canEdit={canEdit} />
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Lead ID", value: <span className="font-mono">{code}</span> },
                  {
                    label: "Stage",
                    value: (
                      <StatusBadge tone={LEAD_STATUS_TONES[lead.status]}>
                        {LEAD_STATUS_LABELS[lead.status]}
                      </StatusBadge>
                    ),
                  },
                  { label: "Company", value: lead.companyName },
                  { label: "Source", value: LEAD_SOURCE_LABELS[lead.source] },
                  {
                    label: "Email",
                    value: lead.email ? (
                      <a className="text-primary hover:underline" href={`mailto:${lead.email}`}>
                        {lead.email}
                      </a>
                    ) : null,
                  },
                  {
                    label: "Phone",
                    value: lead.phone ? (
                      <a
                        className="text-primary hover:underline"
                        href={`tel:${lead.phone.replace(/\s/g, "")}`}
                      >
                        {lead.phone}
                      </a>
                    ) : null,
                  },
                  { label: "Assigned to", value: lead.assignedTo?.name ?? "Unassigned" },
                  { label: "Expected value", value: formatMoney(lead.expectedValue, format) },
                  {
                    label: "Follow-up date",
                    value: lead.followUpDate ? (
                      <span className={overdue ? "font-medium text-danger" : undefined}>
                        {formatCalendarDate(lead.followUpDate, format)}
                        {overdue ? " (overdue)" : ""}
                      </span>
                    ) : null,
                  },
                  {
                    label: "Customer",
                    value: lead.customer ? (
                      lead.customer.deletedAt ? (
                        `${formatRecordNumber("customer", lead.customer.number)} · ${lead.customer.name} (deleted)`
                      ) : (
                        <Link
                          className="text-primary hover:underline"
                          href={`/crm/customers/${lead.customer.id}`}
                        >
                          {formatRecordNumber("customer", lead.customer.number)} · {lead.customer.name}
                        </Link>
                      )
                    ) : (
                      "Not converted yet"
                    ),
                  },
                  {
                    label: "Created",
                    value: `${formatDate(lead.createdAt, format)}${lead.createdBy ? ` by ${lead.createdBy.name}` : ""}`,
                  },
                  { label: "Last updated", value: formatDateTime(lead.updatedAt, format) },
                ]}
              />
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Notes</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.notes ? (
                <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes.</p>
              )}
            </CardContent>
          </Card>
        </div>
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
