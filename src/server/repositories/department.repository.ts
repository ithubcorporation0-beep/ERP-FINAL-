import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  name: true,
  description: true,
  isActive: true,
  createdAt: true,
  _count: { select: { employees: { where: { deletedAt: null } } } },
} as const;

export interface DepartmentData {
  name: string;
  description: string | null;
  isActive?: boolean;
}

export const departmentRepository = {
  list(companyId: string, client: DbClient = db) {
    return client.department.findMany({ where: { companyId }, orderBy: { name: "asc" }, select });
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.department.findFirst({ where: { id, companyId }, select });
  },

  findByName(companyId: string, name: string, client: DbClient = db) {
    return client.department.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
  },

  create(companyId: string, data: DepartmentData, actorId: ActorId, client: DbClient = db) {
    return client.department.create({ data: { ...data, companyId, ...createdBy(actorId) }, select });
  },

  async update(companyId: string, id: string, data: DepartmentData, actorId: ActorId, client: DbClient = db) {
    const { count } = await client.department.updateMany({
      where: { id, companyId },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Deletes a department nobody (not even a deleted employee record) belongs to; returns how many were deleted. */
  delete(companyId: string, id: string, client: DbClient = db) {
    return client.department.deleteMany({ where: { id, companyId, employees: { none: {} } } });
  },
};
