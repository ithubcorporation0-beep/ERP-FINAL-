import type { TenantContext } from "@/lib/tenant";
import { auditLogRepository } from "@/server/repositories/audit-log.repository";

/**
 * Human-readable change history of one record, built from the audit log. Shows which fields changed, not their
 * old values — the audit log itself (phase 13) is the place for full before/after snapshots.
 */

export interface HistoryEntry {
  id: string;
  /** e.g. "Updated", "Uploaded a document". */
  label: string;
  /** Extra context, e.g. "Changed: email, phone" or the file name. */
  detail: string | null;
  actorName: string | null;
  at: Date;
}

export interface HistoryLabels {
  actions: Record<string, string>;
  fields: Record<string, string>;
  /** Optional per-action detail from the event's metadata / after snapshot. */
  detail?: (action: string, data: { after: unknown; metadata: unknown }) => string | null;
}

const IGNORED_FIELDS = new Set([
  "updatedAt",
  "updatedById",
  "updatedBy",
  "createdBy",
  "createdById",
  "statusChangedAt",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Field names whose value differs between two audit snapshots. */
export function changedFields(before: unknown, after: unknown): string[] {
  if (!isRecord(before) || !isRecord(after)) return [];
  return Object.keys(after).filter(
    (key) => !IGNORED_FIELDS.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

export async function recordHistory(
  ctx: TenantContext,
  entityType: string,
  entityId: string,
  labels: HistoryLabels,
  limit = 50,
): Promise<HistoryEntry[]> {
  const events = await auditLogRepository.listForEntity(ctx.companyId, entityType, entityId, { limit });
  return events.map((event) => {
    const changes = changedFields(event.before, event.after).map((field) => labels.fields[field] ?? field);
    const custom = labels.detail?.(event.action, { after: event.after, metadata: event.metadata }) ?? null;
    return {
      id: event.id,
      label: labels.actions[event.action] ?? event.action,
      detail: custom ?? (changes.length > 0 ? `Changed: ${changes.join(", ")}` : null),
      actorName: event.actor?.name ?? null,
      at: event.createdAt,
    };
  });
}

/** Reads a string property from an audit snapshot (JSON). */
export function snapshotText(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === "string" ? field : null;
}
