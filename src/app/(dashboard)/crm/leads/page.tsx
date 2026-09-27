import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { LeadFilters } from "@/features/crm/lead-filters";
import { LeadList } from "@/features/crm/lead-list";
import { companyToday, toLeadRow } from "@/features/crm/lead-view";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { leadListQuerySchema } from "@/lib/validation";
import { companyService } from "@/server/services/company.service";
import { leadService } from "@/server/services/lead.service";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/crm/leads">) {
  const ctx = await authorizePage("leads:view");
  if (!ctx) return <AccessDenied />;

  const query = leadListQuerySchema.catch(leadListQuerySchema.parse({})).parse(await searchParams);
  const [result, assignees, format] = await Promise.all([
    leadService.list(ctx, query),
    leadService.assignableUsers(ctx),
    companyService.formatting(ctx),
  ]);
  const today = companyToday(format.timeZone);
  const canCreate = can(ctx, "leads:create");

  return (
    <>
      <PageHeader
        title="Leads"
        description="Potential customers, who's working on them and what they could be worth."
        actions={
          canCreate ? (
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
        <LeadFilters withStatus assignees={assignees.map((user) => ({ value: user.id, label: user.name }))} />
        <LeadList
          rows={result.items.map((lead) => toLeadRow(lead, format, today))}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          canCreate={canCreate}
        />
      </div>
    </>
  );
}
