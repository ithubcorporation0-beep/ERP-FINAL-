import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ActorId, DbClient } from "./helpers";

const select = {
  id: true,
  customerId: true,
  channel: true,
  direction: true,
  subject: true,
  body: true,
  occurredAt: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { name: true } },
} as const;

export type CommunicationData = Pick<
  Prisma.CustomerCommunicationUncheckedCreateInput,
  "channel" | "direction" | "subject" | "body" | "occurredAt"
>;

export const customerCommunicationRepository = {
  list(companyId: string, customerId: string, { limit }: { limit: number }, client: DbClient = db) {
    return client.customerCommunication.findMany({
      where: { companyId, customerId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select,
    });
  },

  count(companyId: string, customerId: string, client: DbClient = db) {
    return client.customerCommunication.count({ where: { companyId, customerId } });
  },

  findById(companyId: string, customerId: string, id: string, client: DbClient = db) {
    return client.customerCommunication.findFirst({ where: { id, companyId, customerId }, select });
  },

  create(
    companyId: string,
    customerId: string,
    data: CommunicationData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.customerCommunication.create({
      data: { ...data, companyId, customerId, createdById: actorId },
      select,
    });
  },

  delete(companyId: string, customerId: string, id: string, client: DbClient = db) {
    return client.customerCommunication.deleteMany({ where: { id, companyId, customerId } });
  },
};
