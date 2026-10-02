import type { MembershipStatus, Prisma } from "@/generated/prisma/client";
import { crossTenant, db } from "@/lib/db";
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
    const query = () =>
      client.membership.findFirst({
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
    // Without a company, this looks across the user's own memberships to pick their default company.
    const membership = companyId ? await query() : await crossTenant("user's default company", query);
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

  /** Active members as {id, name} (user id), for "assign to" pickers. */
  async listActiveUsers(companyId: string, client: DbClient = db) {
    const rows = await client.membership.findMany({
      where: { companyId, status: "ACTIVE" },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    });
    return rows.map((row) => row.user);
  },

  /** Active members (with active accounts) whose role grants `permission` — notification audiences. */
  async listUsersWithPermission(companyId: string, permission: string, client: DbClient = db) {
    const rows = await client.membership.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        user: { status: "ACTIVE" },
        role: { rolePermissions: { some: { permission: { key: permission } } } },
      },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    return rows.map((row) => row.user);
  },

  /** Active members (with active accounts) among the given users — e.g. an assignee's login. */
  async listActiveUsersByIds(companyId: string, userIds: readonly string[], client: DbClient = db) {
    const rows = await client.membership.findMany({
      where: { companyId, status: "ACTIVE", userId: { in: [...userIds] }, user: { status: "ACTIVE" } },
      select: { user: { select: { id: true, name: true, email: true } } },
    });
    return rows.map((row) => row.user);
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
    return crossTenant("activate the user's own invitations in every company", () =>
      client.membership.updateMany({ where: { userId, status: "INVITED" }, data: { status: "ACTIVE" } }),
    );
  },

  /** Companies the user can switch to (active membership in an active company), oldest first. */
  listCompaniesForUser(userId: string, client: DbClient = db) {
    return crossTenant("list the user's own companies for the company switcher", () =>
      client.membership.findMany({
        where: { userId, status: "ACTIVE", company: { status: "ACTIVE", deletedAt: null } },
        orderBy: { createdAt: "asc" },
        select: {
          role: { select: { name: true } },
          company: { select: { id: true, name: true, logoUpdatedAt: true } },
        },
      }),
    );
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
