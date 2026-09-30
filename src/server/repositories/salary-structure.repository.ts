import type { SalaryComponentKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

/** Recurring salary structure lines (restricted: only salary-structure.service.ts and payroll.service.ts use it). */

const select = {
  id: true,
  employeeId: true,
  kind: true,
  name: true,
  amount: true,
  isActive: true,
  updatedAt: true,
} as const;

export interface SalaryComponentData {
  kind: SalaryComponentKind;
  name: string;
  amount: string;
  isActive: boolean;
}

export const salaryStructureRepository = {
  list(companyId: string, employeeId: string, client: DbClient = db) {
    return client.salaryComponent.findMany({
      where: { companyId, employeeId },
      select,
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
  },

  /** Active components of many employees (payroll processing). */
  listActive(companyId: string, employeeIds: readonly string[], client: DbClient = db) {
    return client.salaryComponent.findMany({
      where: { companyId, employeeId: { in: [...employeeIds] }, isActive: true },
      select,
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
  },

  findById(companyId: string, employeeId: string, id: string, client: DbClient = db) {
    return client.salaryComponent.findFirst({ where: { id, companyId, employeeId }, select });
  },

  create(
    companyId: string,
    employeeId: string,
    data: SalaryComponentData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.salaryComponent.create({
      data: { ...data, companyId, employeeId, ...createdBy(actorId) },
      select,
    });
  },

  async update(
    companyId: string,
    employeeId: string,
    id: string,
    data: SalaryComponentData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.salaryComponent.updateMany({
      where: { id, companyId, employeeId },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  delete(companyId: string, employeeId: string, id: string, client: DbClient = db) {
    return client.salaryComponent.deleteMany({ where: { id, companyId, employeeId } });
  },
};
