import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { DbClient } from "./helpers";

/** Append-only: there is intentionally no update or delete. */
export const auditLogRepository = {
  create(data: Omit<Prisma.AuditLogUncheckedCreateInput, "id" | "createdAt">, client: DbClient = db) {
    return client.auditLog.create({ data, select: { id: true } });
  },
};
