import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailList } from "@/features/crm/detail-list";
import { authorizePage } from "@/lib/auth/page";
import { actionGroup, actionGroupLabel, actionVerbLabel } from "@/lib/audit/labels";
import { formatDateTime } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { auditLogService } from "@/server/services/audit-log.service";
import { companyService } from "@/server/services/company.service";

export const metadata: Metadata = { title: "Audit entry" };

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
          {JSON.stringify(value, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

export default async function AuditEntryPage({ params }: PageProps<"/audit-logs/[id]">) {
  const ctx = await authorizePage("audit-logs:view");
  if (!ctx) return <AccessDenied />;
  const entry = await orNotFound(auditLogService.get(ctx, recordIdOrNotFound((await params).id)));
  const format = await companyService.formatting(ctx);

  return (
    <>
      <PageHeader
        title={`${actionGroupLabel(actionGroup(entry.action))}: ${actionVerbLabel(entry.action)}`}
        description={`${formatDateTime(entry.createdAt, format)} · read-only`}
      />
      <div className="space-y-4">
        <Card className="shadow-xs">
          <CardContent>
            <DetailList
              items={[
                {
                  label: "When",
                  value: `${formatDateTime(entry.createdAt, format)} (${entry.createdAt.toISOString()} UTC)`,
                },
                {
                  label: "User",
                  value: entry.actor ? `${entry.actor.name} (${entry.actor.email})` : "System",
                },
                { label: "Action", value: <span className="font-mono">{entry.action}</span> },
                { label: "Record type", value: entry.entityType },
                {
                  label: "Record ID",
                  value: entry.entityId ? <span className="font-mono">{entry.entityId}</span> : null,
                },
                {
                  label: "IP address",
                  value: entry.ipAddress ? <span className="font-mono">{entry.ipAddress}</span> : null,
                },
                { label: "Browser / device", value: entry.userAgent },
              ]}
            />
          </CardContent>
        </Card>
        <JsonBlock title="Before" value={entry.before} />
        <JsonBlock title="After" value={entry.after} />
        <JsonBlock title="Details" value={entry.metadata} />
        <Link href="/audit-logs" className="text-sm text-primary hover:underline">
          Back to the audit log
        </Link>
      </div>
    </>
  );
}
