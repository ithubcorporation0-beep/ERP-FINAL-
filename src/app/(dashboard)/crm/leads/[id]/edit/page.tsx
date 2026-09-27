import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/crm";
import { LeadForm } from "@/features/crm/lead-form";
import { authorizePage } from "@/lib/auth/page";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { companyService } from "@/server/services/company.service";
import { leadService } from "@/server/services/lead.service";

export const metadata: Metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: PageProps<"/crm/leads/[id]/edit">) {
  const ctx = await authorizePage("leads:edit");
  if (!ctx) return <AccessDenied />;
  const lead = await orNotFound(leadService.get(ctx, recordIdOrNotFound((await params).id)));
  const [assignees, format] = await Promise.all([
    leadService.assignableUsers(ctx),
    companyService.formatting(ctx),
  ]);
  // Keep a (since removed) assignee selectable so saving doesn't silently unassign the lead.
  const options = assignees.map((user) => ({ value: user.id, label: user.name }));
  if (lead.assignedTo && !options.some((option) => option.value === lead.assignedTo?.id)) {
    options.push({ value: lead.assignedTo.id, label: `${lead.assignedTo.name} (no longer a member)` });
  }

  return (
    <>
      <PageHeader
        title={`Edit ${lead.name}`}
        description={`Lead ID ${formatRecordNumber("lead", lead.number)}`}
      />
      <Card className="shadow-xs">
        <CardContent>
          <LeadForm
            leadId={lead.id}
            assignees={options}
            currency={format.currency}
            defaults={{
              name: lead.name,
              companyName: lead.companyName ?? "",
              email: lead.email ?? "",
              phone: lead.phone ?? "",
              source: lead.source,
              assignedToId: lead.assignedTo?.id ?? "",
              status: lead.status,
              expectedValue: lead.expectedValue?.toFixed(2) ?? "",
              notes: lead.notes ?? "",
              followUpDate: lead.followUpDate?.toISOString().slice(0, 10) ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
