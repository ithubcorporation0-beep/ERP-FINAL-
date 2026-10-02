import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { auditLogQuerySchema } from "@/lib/validation";
import { auditLogService } from "@/server/services/audit-log.service";

/**
 * Audit entries of the current company, newest first (`?search=&action=&entityType=&actorId=&from=&to=&page=`).
 * Read-only: there is no POST, PUT, PATCH or DELETE for audit logs.
 */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("audit-logs:view");
  const query = auditLogQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await auditLogService.list(ctx, query), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
