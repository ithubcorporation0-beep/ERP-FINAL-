import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { LeadBoard } from "@/features/crm/lead-board";
import { LeadFilters } from "@/features/crm/lead-filters";
import { companyToday, toBoardLead } from "@/features/crm/lead-view";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { leadListQuerySchema } from "@/lib/validation";
import { companyService } from "@/server/services/company.service";
import { leadService } from "@/server/services/lead.service";

export const metadata: Metadata = { title: "Lead pipeline" };

export default async function LeadPipelinePage({ searchParams }: PageProps<"/crm/leads/pipeline">) {
  const ctx = await authorizePage("leads:view");
  if (!ctx) return <AccessDenied />;

  const { search, source, assignee } = leadListQuerySchema
    .catch(leadListQuerySchema.parse({}))
    .parse(await searchParams);
  const [columns, assignees, format] = await Promise.all([
    leadService.board(ctx, { search, source, assignee }),
    leadService.assignableUsers(ctx),
    companyService.formatting(ctx),
  ]);
  const today = companyToday(format.timeZone);

  return (
    <>
      <PageHeader
        title="Lead pipeline"
        description="Drag a lead to another stage, or use its menu to move it."
        actions={
          can(ctx, "leads:create") ? (
            <Button asChild>
              <Link href="/crm/leads/new">
                <Plus aria-hidden="true" />
                Add lead
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <LeadFilters
          withStatus={false}
          assignees={assignees.map((user) => ({ value: user.id, label: user.name }))}
        />
        <LeadBoard
          canEdit={can(ctx, "leads:edit")}
          locale={format.locale}
          currency={format.currency}
          columns={columns.map((column) => ({
            status: column.status,
            total: column.total,
            expectedValue: column.expectedValue?.toString() ?? null,
            leads: column.items.map((lead) => toBoardLead(lead, format, today)),
          }))}
        />
      </div>
    </>
  );
}
