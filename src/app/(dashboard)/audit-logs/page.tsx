import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { AuditLogList } from "@/features/audit/audit-log-list";
import { authorizePage } from "@/lib/auth/page";
import { actionGroup, actionGroupLabel, actionVerbLabel } from "@/lib/audit/labels";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/tenant";
import { auditLogQuerySchema } from "@/lib/validation";
import { auditLogService } from "@/server/services/audit-log.service";
import { companyService } from "@/server/services/company.service";

export const metadata: Metadata = { title: "Audit Logs" };

export default async function AuditLogsPage({ searchParams }: PageProps<"/audit-logs">) {
  // Server-side check: hiding the menu link is not protection.
  const ctx = await authorizePage("audit-logs:view");
  if (!ctx) return <AccessDenied />;
  const raw = await searchParams;
  const query = auditLogQuerySchema.catch(auditLogQuerySchema.parse({})).parse(raw);
  const [result, options, format] = await Promise.all([
    auditLogService.list(ctx, query),
    auditLogService.filterOptions(ctx),
    companyService.formatting(ctx),
  ]);
  const exportParams = new URLSearchParams();
  for (const key of ["search", "action", "entityType", "actorId", "from", "to"] as const) {
    const value = query[key];
    if (value) exportParams.set(key, value);
  }

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Who did what, when and from where — sign-ins, changes, approvals, payments and more. Entries can't be edited or deleted by anyone."
      />
      <AuditLogList
        rows={result.items.map((entry) => ({
          id: entry.id,
          at: entry.createdAt.toISOString(),
          atLabel: formatDateTime(entry.createdAt, format),
          actor: entry.actor?.name ?? "System",
          actorEmail: entry.actor?.email ?? null,
          group: actionGroupLabel(actionGroup(entry.action)),
          verb: actionVerbLabel(entry.action),
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ipAddress: entry.ipAddress,
        }))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        groups={options.groups}
        entityTypes={options.entityTypes}
        actors={options.actors.map((actor) => ({ value: actor.id, label: `${actor.name} (${actor.email})` }))}
        exportQuery={can(ctx, "audit-logs:export") ? exportParams.toString() : null}
      />
    </>
  );
}
