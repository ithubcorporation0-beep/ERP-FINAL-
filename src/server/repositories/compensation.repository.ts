import { db } from "@/lib/db";
import type { ActorId, DbClient } from "./helpers";

/**
 * Salary and bank details (restricted). Only compensation.service.ts may call this, after checking
 * `salaries:view` / `salaries:edit`. Ciphertext columns are returned for decryption on explicit reveal only.
 */
export interface CompensationData {
  salary: string | null;
  currency: string;
  bankName: string | null;
  accountTitle: string | null;
  /** Omitted = unchanged; null = cleared. */
  accountNumberCipher?: string | null;
  accountNumberLast4?: string | null;
  ibanCipher?: string | null;
  ibanLast4?: string | null;
}

export const compensationRepository = {
  find(companyId: string, employeeId: string, client: DbClient = db) {
    return client.employeeCompensation.findFirst({
      where: { companyId, employeeId },
      select: {
        salary: true,
        currency: true,
        bankName: true,
        accountTitle: true,
        accountNumberCipher: true,
        accountNumberLast4: true,
        ibanCipher: true,
        ibanLast4: true,
        updatedAt: true,
        updatedBy: { select: { name: true } },
      },
    });
  },

  /** Basic salaries of many employees (payroll processing). */
  listSalaries(companyId: string, employeeIds: readonly string[], client: DbClient = db) {
    return client.employeeCompensation.findMany({
      where: { companyId, employeeId: { in: [...employeeIds] } },
      select: { employeeId: true, salary: true, currency: true },
    });
  },

  upsert(
    companyId: string,
    employeeId: string,
    data: CompensationData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.employeeCompensation.upsert({
      where: { employeeId_companyId: { employeeId, companyId } },
      create: { ...data, companyId, employeeId, updatedById: actorId },
      update: { ...data, updatedById: actorId },
      select: { id: true },
    });
  },
};
