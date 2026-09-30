import type { PaymentMethod, SalaryAdvanceStatus } from "@/generated/prisma/client";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  number: true,
  employeeId: true,
  amount: true,
  advanceDate: true,
  paymentMethod: true,
  reason: true,
  status: true,
  recoveredRunId: true,
  createdAt: true,
  employee: { select: { id: true, number: true, name: true } },
  recoveredRun: { select: { id: true, number: true, periodYear: true, periodMonth: true } },
  createdBy: { select: { name: true } },
} as const;

export const salaryAdvanceRepository = {
  list(
    companyId: string,
    filter: { employeeId?: string; status?: SalaryAdvanceStatus } = {},
    client: DbClient = db,
  ) {
    return client.salaryAdvance.findMany({
      where: {
        companyId,
        ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      select,
      orderBy: [{ advanceDate: "desc" }, { number: "desc" }],
      take: 500,
    });
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.salaryAdvance.findFirst({ where: { id, companyId }, select });
  },

  /** Outstanding advances of these employees given on or before `until` (recovered by the payroll run). */
  listOutstanding(companyId: string, employeeIds: readonly string[], until: string, client: DbClient = db) {
    return client.salaryAdvance.findMany({
      where: {
        companyId,
        employeeId: { in: [...employeeIds] },
        status: "OUTSTANDING",
        advanceDate: { lte: dateOnlyToDate(until) },
      },
      select,
      orderBy: [{ advanceDate: "asc" }, { number: "asc" }],
    });
  },

  create(
    companyId: string,
    number: number,
    data: {
      employeeId: string;
      amount: string;
      advanceDate: Date;
      paymentMethod: PaymentMethod;
      reason: string;
    },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.salaryAdvance.create({
      data: { ...data, number, companyId, ...createdBy(actorId) },
      select,
    });
  },

  /** Cancels an advance that hasn't been recovered yet. */
  async cancel(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    const { count } = await client.salaryAdvance.updateMany({
      where: { id, companyId, status: "OUTSTANDING" },
      data: { status: "CANCELLED", ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Marks exactly these outstanding advances as recovered by a run; returns how many changed. */
  async markRecovered(
    companyId: string,
    ids: readonly string[],
    runId: string,
    actorId: ActorId,
    client: DbClient,
  ) {
    const { count } = await client.salaryAdvance.updateMany({
      where: { companyId, id: { in: [...ids] }, status: "OUTSTANDING" },
      data: { status: "RECOVERED", recoveredRunId: runId, ...updatedBy(actorId) },
    });
    return count;
  },
};
