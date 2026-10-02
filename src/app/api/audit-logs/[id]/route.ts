import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { auditLogService } from "@/server/services/audit-log.service";

type Context = RouteContext<"/api/audit-logs/[id]">;

/** One entry with its before / after snapshots and request details. */
export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("audit-logs:view");
  return NextResponse.json(await auditLogService.get(ctx, routeId((await params).id, "Audit entry")), {
    headers: { "Cache-Control": "private, no-store" },
  });
});
