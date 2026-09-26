import type { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { SUPER_ADMIN_ROLE } from "@/lib/permissions";
import {
  createdBy,
  pageArgs,
  toPage,
  updatedBy,
  type ActorId,
  type DbClient,
  type PageQuery,
} from "./helpers";

export interface CompanyAccess {
  companyId: string;
  roleId: string;
  roleName: string;
  permissions: string[];
}

const memberSelect = {
  id: true,
  status: true,
  createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true, isSystem: true } },
  user: {
    select: { id: true, name: true, email: true, status: true, lastLoginAt: true, emailVerifiedAt: true },
  },
} as const;

export const membershipRepository = {
  /**
   * The user's access to a company: ACTIVE membership in an ACTIVE, non-deleted company, with the role's
   * permission keys. Without `companyId`, returns the user's first (oldest) company.
   */
  async findAccess(userId: string, companyId?: string, client: DbClient = db): Promise<CompanyAccess | null> {
    const membership = await client.membership.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        ...(companyId ? { companyId } : {}),
        company: { status: "ACTIVE", deletedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        companyId: true,
        role: {
          select: {
            id: true,
            name: true,
            rolePermissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    if (!membership) return null;
    return {
      companyId: membership.companyId,
      roleId: membership.role.id,
      roleName: membership.role.name,
      permissions: membership.role.rolePermissions.map((row) => row.permission.key),
    };
  },

  async list(companyId: string, query: PageQuery & { search?: string }, client: DbClient = db) {
    const where: Prisma.MembershipWhereInput = {
      companyId,
      ...(query.search
        ? {
            user: {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { email: { contains: query.search, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.membership.findMany({
        where,
        select: memberSelect,
        orderBy: { createdAt: "asc" },
        ...pageArgs(query),
      }),
      client.membership.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.membership.findFirst({ where: { id, companyId }, select: memberSelect });
  },

  findByUser(companyId: string, userId: string, client: DbClient = db) {
    return client.membership.findUnique({
      where: { companyId_userId: { companyId, userId } },
      select: memberSelect,
    });
  },

  create(
    companyId: string,
    data: { userId: string; roleId: string; status: MembershipStatus },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.membership.create({
      data: { ...data, companyId, ...createdBy(actorId) },
      select: memberSelect,
    });
  },

  upsert(companyId: string, userId: string, roleId: string, actorId: ActorId, client: DbClient = db) {
    return client.membership.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: { companyId, userId, roleId, ...createdBy(actorId) },
      update: { roleId, ...updatedBy(actorId) },
      select: { id: true },
    });
  },

  update(
    companyId: string,
    id: string,
    data: { roleId?: string; status?: MembershipStatus },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.membership.updateMany({
      where: { id, companyId },
      data: { ...data, ...updatedBy(actorId) },
    });
  },

  /** Activates a user's INVITED memberships (all companies that invited them). */
  activateInvited(userId: string, client: DbClient = db) {
    return client.membership.updateMany({ where: { userId, status: "INVITED" }, data: { status: "ACTIVE" } });
  },

  delete(companyId: string, id: string, client: DbClient = db) {
    return client.membership.deleteMany({ where: { id, companyId } });
  },

  countActiveSuperAdmins(companyId: string, client: DbClient = db) {
    return client.membership.count({
      where: { companyId, status: "ACTIVE", role: { name: SUPER_ADMIN_ROLE, isSystem: true } },
    });
  },
};
