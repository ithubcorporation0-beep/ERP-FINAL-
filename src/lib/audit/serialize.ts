import type { Prisma } from "@/generated/prisma/client";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Keys never written to the audit log, wherever they appear. */
const REDACTED_KEYS = new Set(["passwordHash", "tokenHash", "password", "token"]);

function toJson(value: unknown, depth: number): Json {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toJson(item, depth + 1));
  if (typeof value === "object") {
    // Prisma Decimal and similar types serialize themselves.
    if ("toJSON" in value && typeof value.toJSON === "function") return toJson(value.toJSON(), depth + 1);
    const result: { [key: string]: Json } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      result[key] = REDACTED_KEYS.has(key) ? "[redacted]" : toJson(item, depth + 1);
    }
    return result;
  }
  return String(value);
}

/** Converts a record snapshot into JSON for `audit_logs.before/after`, redacting secrets. */
export function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  const json = toJson(value, 0);
  return json === null ? undefined : json;
}
