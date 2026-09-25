import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";

export async function writeAuditLog(
  ctx: TenantContext,
  entry: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown },
  client: Prisma.TransactionClient = db,
) {
  await client.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before as Prisma.InputJsonValue | undefined,
      after: entry.after as Prisma.InputJsonValue | undefined,
    },
  });
}
