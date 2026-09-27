import { db } from "@/lib/db";
import type { ActorId, DbClient } from "./helpers";

const select = {
  id: true,
  customerId: true,
  name: true,
  storageKey: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} as const;

export const customerDocumentRepository = {
  list(companyId: string, customerId: string, client: DbClient = db) {
    return client.customerDocument.findMany({
      where: { companyId, customerId },
      orderBy: { createdAt: "desc" },
      select,
    });
  },

  findById(companyId: string, customerId: string, id: string, client: DbClient = db) {
    return client.customerDocument.findFirst({ where: { id, companyId, customerId }, select });
  },

  create(
    companyId: string,
    data: { customerId: string; name: string; storageKey: string; contentType: string; sizeBytes: number },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.customerDocument.create({ data: { ...data, companyId, createdById: actorId }, select });
  },

  delete(companyId: string, customerId: string, id: string, client: DbClient = db) {
    return client.customerDocument.deleteMany({ where: { id, companyId, customerId } });
  },
};
