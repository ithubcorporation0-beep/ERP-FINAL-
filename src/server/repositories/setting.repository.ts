import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

export const settingRepository = {
  findAll(companyId: string, client: DbClient = db) {
    return client.setting.findMany({ where: { companyId }, select: { key: true, value: true } });
  },

  find(companyId: string, key: string, client: DbClient = db) {
    return client.setting.findUnique({
      where: { companyId_key: { companyId, key } },
      select: { key: true, value: true },
    });
  },

  upsert(
    companyId: string,
    key: string,
    value: Prisma.InputJsonValue,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.setting.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, value, ...createdBy(actorId) },
      update: { value, ...updatedBy(actorId) },
      select: { key: true, value: true },
    });
  },
};
