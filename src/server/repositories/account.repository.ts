import type { AccountType, Prisma } from "@/generated/prisma/client";
import type { DefaultAccount } from "@/config/accounting";
import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  code: true,
  name: true,
  type: true,
  systemKey: true,
  description: true,
  isActive: true,
} as const;

export const accountRepository = {
  list(companyId: string, client: DbClient = db) {
    return client.account.findMany({ where: { companyId }, select, orderBy: [{ code: "asc" }] });
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.account.findFirst({ where: { id, companyId }, select });
  },

  /** System accounts by key, e.g. ["cash", "receivable"]. */
  findSystem(companyId: string, keys: readonly string[], client: DbClient = db) {
    return client.account.findMany({ where: { companyId, systemKey: { in: [...keys] } }, select });
  },

  /** Creates any default accounts the company doesn't have yet (existing ones are left untouched). */
  createDefaults(companyId: string, accounts: readonly DefaultAccount[], client: DbClient = db) {
    return client.account.createMany({
      data: accounts.map((account) => ({ ...account, companyId })),
      skipDuplicates: true,
    });
  },

  create(
    companyId: string,
    data: { code: string; name: string; type: AccountType; description: string | null },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.account.create({ data: { ...data, companyId, ...createdBy(actorId) }, select });
  },

  async update(
    companyId: string,
    id: string,
    data: Prisma.AccountUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.account.updateMany({
      where: { id, companyId },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count === 0 ? null : client.account.findFirst({ where: { id, companyId }, select });
  },

  /** Only accounts without postings and without a system role can be deleted. */
  delete(companyId: string, id: string, client: DbClient = db) {
    return client.account.deleteMany({ where: { id, companyId, systemKey: null, lines: { none: {} } } });
  },

  countLines(companyId: string, accountId: string, client: DbClient = db) {
    return client.journalLine.count({ where: { companyId, accountId } });
  },
};
