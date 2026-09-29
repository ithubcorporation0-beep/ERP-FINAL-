import { db } from "@/lib/db";
import type { ActorId, DbClient } from "./helpers";

const select = {
  id: true,
  employeeId: true,
  name: true,
  storageKey: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} as const;

export const employeeDocumentRepository = {
  list(companyId: string, employeeId: string, client: DbClient = db) {
    return client.employeeDocument.findMany({
      where: { companyId, employeeId },
      orderBy: { createdAt: "desc" },
      select,
    });
  },

  findById(companyId: string, employeeId: string, id: string, client: DbClient = db) {
    return client.employeeDocument.findFirst({ where: { id, companyId, employeeId }, select });
  },

  create(
    companyId: string,
    data: { employeeId: string; name: string; storageKey: string; contentType: string; sizeBytes: number },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.employeeDocument.create({ data: { ...data, companyId, createdById: actorId }, select });
  },

  delete(companyId: string, employeeId: string, id: string, client: DbClient = db) {
    return client.employeeDocument.deleteMany({ where: { id, companyId, employeeId } });
  },
};
