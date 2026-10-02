import "server-only";
import { addDays, zonedInstant } from "@/lib/date-range";
import { NotFoundError } from "@/lib/errors";
import { actionGroup, actionGroupLabel, actionVerbLabel, csvCell } from "@/lib/audit/labels";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { AuditLogQuery } from "@/lib/validation";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import { writeAuditLog } from "./audit.service";
import { salesContext } from "./sales-shared";

/**
 * The audit log viewer (docs/audit-logs.md). `audit-logs:view` to search and read, `audit-logs:export` to download
 * a CSV. Read-only by design: there is no way to change or delete an entry — the repository has no such function
 * and the database refuses it. Every query is scoped to the current company.
 */

const EXPORT_LIMIT = 5000;

async function bounds(ctx: TenantContext, query: AuditLogQuery) {
  const { timeZone } = await salesContext(ctx);
  return {
    from: query.from ? zonedInstant(query.from, 0, timeZone) : undefined,
    to: query.to ? zonedInstant(addDays(query.to, 1), 0, timeZone) : undefined,
  };
}

export const auditLogService = {
  async list(ctx: TenantContext, query: AuditLogQuery) {
    authorize(ctx, "audit-logs:view");
    return auditLogRepository.list(ctx.companyId, query, await bounds(ctx, query));
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "audit-logs:view");
    const entry = await auditLogRepository.findById(ctx.companyId, id);
    if (!entry) throw new NotFoundError("Audit entry");
    return entry;
  },

  /** Groups (module prefixes), exact actions, entity types and people that occur in this company's log. */
  async filterOptions(ctx: TenantContext) {
    authorize(ctx, "audit-logs:view");
    const options = await auditLogRepository.filterOptions(ctx.companyId);
    const groups = [...new Set(options.actions.map(actionGroup))].sort();
    return {
      groups: groups.map((group) => ({ value: group, label: actionGroupLabel(group) })),
      actions: options.actions.map((action) => ({
        value: action,
        label: `${actionGroupLabel(actionGroup(action))}: ${actionVerbLabel(action)}`,
      })),
      entityTypes: options.entityTypes,
      actors: options.actors,
    };
  },

  /** CSV of the filtered entries (newest first, at most 5,000). The export itself is audited. */
  async exportCsv(ctx: TenantContext, query: AuditLogQuery) {
    authorize(ctx, "audit-logs:export");
    const page = await auditLogRepository.list(
      ctx.companyId,
      { ...query, page: 1, pageSize: EXPORT_LIMIT },
      await bounds(ctx, query),
    );
    const header = ["Time (UTC)", "User", "Email", "Action", "Entity", "Entity ID", "IP address"];
    const lines = page.items.map((entry) =>
      [
        entry.createdAt.toISOString(),
        entry.actor?.name ?? "System",
        entry.actor?.email ?? "",
        entry.action,
        entry.entityType,
        entry.entityId ?? "",
        entry.ipAddress ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    await writeAuditLog(ctx, {
      action: "audit_log.export",
      entityType: "AuditLog",
      metadata: { rows: page.items.length, filters: query },
    });
    return {
      csv: [header.join(","), ...lines].join("\r\n"),
      rows: page.items.length,
      truncated: page.total > EXPORT_LIMIT,
    };
  },
};
