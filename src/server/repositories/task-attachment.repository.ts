import { db } from "@/lib/db";
import type { ActorId, DbClient } from "./helpers";

const select = {
  id: true,
  taskId: true,
  name: true,
  storageKey: true,
  contentType: true,
  sizeBytes: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { name: true } },
} as const;

export const taskAttachmentRepository = {
  list(companyId: string, taskId: string, client: DbClient = db) {
    return client.taskAttachment.findMany({
      where: { companyId, taskId },
      orderBy: { createdAt: "desc" },
      select,
    });
  },

  findById(companyId: string, taskId: string, id: string, client: DbClient = db) {
    return client.taskAttachment.findFirst({ where: { id, companyId, taskId }, select });
  },

  create(
    companyId: string,
    data: { taskId: string; name: string; storageKey: string; contentType: string; sizeBytes: number },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.taskAttachment.create({ data: { ...data, companyId, createdById: actorId }, select });
  },

  delete(companyId: string, taskId: string, id: string, client: DbClient = db) {
    return client.taskAttachment.deleteMany({ where: { id, companyId, taskId } });
  },
};
