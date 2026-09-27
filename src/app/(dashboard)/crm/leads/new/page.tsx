import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY_LEAD } from "@/features/crm/defaults";
import { LeadForm } from "@/features/crm/lead-form";
import { authorizePage } from "@/lib/auth/page";
import { companyService } from "@/server/services/company.service";
import { leadService } from "@/server/services/lead.service";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const ctx = await authorizePage("leads:create");
  if (!ctx) return <AccessDenied />;
  const [assignees, format] = await Promise.all([
    leadService.assignableUsers(ctx),
    companyService.formatting(ctx),
  ]);
  return (
    <>
      <PageHeader title="New lead" description="A Lead ID is assigned automatically when you save." />
      <Card className="shadow-xs">
        <CardContent>
          <LeadForm
            defaults={{ ...EMPTY_LEAD, assignedToId: ctx.userId }}
            assignees={assignees.map((user) => ({ value: user.id, label: user.name }))}
            currency={format.currency}
          />
        </CardContent>
      </Card>
    </>
  );
}
