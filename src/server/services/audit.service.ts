import { toAuditJson } from "@/lib/audit/serialize";
import type { TenantContext } from "@/lib/tenant";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";
import type { DbClient } from "@/server/repositories/helpers";

export interface AuditEvent {
  /** Dotted verb, e.g. "customer.create". */
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  companyId?: string | null;
  actorId?: string | null;
  ipAddress?: string;
  userAgent?: string;
}

/** Records any event, including account-level ones without a company (e.g. sign-in). */
export async function recordAuditEvent(event: AuditEvent, client?: DbClient) {
  await auditLogRepository.create(
    {
      companyId: event.companyId ?? null,
      actorId: event.actorId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      before: toAuditJson(event.before),
      after: toAuditJson(event.after),
      metadata: toAuditJson(event.metadata),
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
    },
    client,
  );
}

/** Records an action in the current company by the current user. Call inside the same transaction as the change. */
export function writeAuditLog(
  ctx: TenantContext,
  event: Omit<AuditEvent, "companyId" | "actorId">,
  client?: DbClient,
) {
  return recordAuditEvent({ ...event, companyId: ctx.companyId, actorId: ctx.userId }, client);
}
