import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

/** Append-only: there is intentionally no update or delete. */
export const auditLogRepository = {
  create(data: Omit<Prisma.AuditLogUncheckedCreateInput, "id" | "createdAt">, client: DbClient = db) {
    return client.auditLog.create({ data, select: { id: true } });
  },

  /** Change history of one record, newest first, with the actor's name. */
  listForEntity(
    companyId: string,
    entityType: string,
    entityId: string,
    { limit }: { limit: number },
    client: DbClient = db,
  ) {
    return client.auditLog.findMany({
      where: { companyId, entityType, entityId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        before: true,
        after: true,
        metadata: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    });
  },
};
