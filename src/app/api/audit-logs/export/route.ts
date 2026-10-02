import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { auditLogQuerySchema } from "@/lib/validation";
import { auditLogService } from "@/server/services/audit-log.service";

/** CSV download of the filtered entries (max 5,000 rows). Needs `audit-logs:export`; the export is audited. */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("audit-logs:export");
  const query = auditLogQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const { csv } = await auditLogService.exportCsv(ctx, query);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});
