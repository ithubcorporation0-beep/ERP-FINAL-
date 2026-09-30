import type { PayrollStatus, Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { PayrollListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const runSelect = {
  id: true,
  number: true,
  periodYear: true,
  periodMonth: true,
  periodStart: true,
  periodEnd: true,
  payDate: true,
  currency: true,
  status: true,
  notes: true,
  reviewNote: true,
  approvedAt: true,
  paidAt: true,
  paidMethod: true,
  cancelReason: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  paidBy: { select: { name: true } },
} as const;

const itemSelect = {
  id: true,
  runId: true,
  employeeId: true,
  employeeNumber: true,
  employeeName: true,
  departmentName: true,
  position: true,
  basic: true,
  allowances: true,
  bonus: true,
  overtime: true,
  deductions: true,
  tax: true,
  advances: true,
  net: true,
  lines: true,
  partialPeriod: true,
  note: true,
  updatedAt: true,
  updatedBy: { select: { name: true } },
} as const;

export interface PayrollItemData {
  employeeId: string;
  employeeNumber: number;
  employeeName: string;
  departmentName: string | null;
  position: string | null;
  basic: string;
  allowances: string;
  bonus: string;
  overtime: string;
  deductions: string;
  tax: string;
  advances: string;
  net: string;
  lines: Prisma.InputJsonValue;
  partialPeriod: boolean;
  note: string | null;
}

/** Money columns summed per run (list and reports). */
const SUMS = {
  basic: true,
  allowances: true,
  bonus: true,
  overtime: true,
  deductions: true,
  tax: true,
  advances: true,
  net: true,
} as const;

export const payrollRepository = {
  async listRuns(companyId: string, query: PayrollListQuery, client: DbClient = db) {
    const number = query.search ? parseRecordNumber("payroll", query.search) : undefined;
    const where: Prisma.PayrollRunWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(number !== undefined ? { number } : {}),
    };
    const [items, total] = await Promise.all([
      client.payrollRun.findMany({
        where,
        select: { ...runSelect, _count: { select: { items: true } } },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }, { number: "desc" }],
        ...pageArgs(query),
      }),
      client.payrollRun.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findRun(companyId: string, id: string, client: DbClient = db) {
    return client.payrollRun.findFirst({ where: { id, companyId }, select: runSelect });
  },

  /** The non-cancelled run of a month, if any. */
  findActiveRun(companyId: string, period: string, client: DbClient = db) {
    return client.payrollRun.findFirst({ where: { companyId, activePeriod: period }, select: runSelect });
  },

  createRun(
    companyId: string,
    number: number,
    data: {
      periodYear: number;
      periodMonth: number;
      periodStart: Date;
      periodEnd: Date;
      activePeriod: string;
      payDate: Date;
      currency: string;
      notes: string | null;
    },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.payrollRun.create({
      data: { ...data, number, companyId, ...createdBy(actorId) },
      select: runSelect,
    });
  },

  /** Moves a run between statuses only if it is still in one of `from` (checked in the UPDATE itself). */
  async updateRun(
    companyId: string,
    id: string,
    from: readonly PayrollStatus[],
    data: Prisma.PayrollRunUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.payrollRun.updateMany({
      where: { id, companyId, status: { in: [...from] } },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /**
   * Locks the run row until the transaction ends, so edits, recalculation and status changes of one run happen
   * one after the other. Raw SQL (Prisma has no FOR UPDATE); scoped by company explicitly.
   */
  async lockRun(companyId: string, id: string, client: DbClient) {
    const rows = await client.$queryRaw<{ status: PayrollStatus }[]>`
      SELECT status FROM payroll_runs WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`;
    return rows[0]?.status ?? null;
  },

  listItems(companyId: string, runId: string, client: DbClient = db) {
    return client.payrollItem.findMany({
      where: { companyId, runId },
      select: itemSelect,
      orderBy: [{ employeeName: "asc" }, { employeeNumber: "asc" }],
    });
  },

  findItem(companyId: string, runId: string, id: string, client: DbClient = db) {
    return client.payrollItem.findFirst({ where: { id, companyId, runId }, select: itemSelect });
  },

  createItems(
    companyId: string,
    runId: string,
    items: readonly PayrollItemData[],
    actorId: ActorId,
    client: DbClient,
  ) {
    return client.payrollItem.createMany({
      data: items.map((item) => ({ ...item, companyId, runId, updatedById: actorId })),
    });
  },

  async updateItem(
    companyId: string,
    runId: string,
    id: string,
    data: Prisma.PayrollItemUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient,
  ) {
    const { count } = await client.payrollItem.updateMany({
      where: { id, companyId, runId },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  deleteItems(companyId: string, runId: string, client: DbClient) {
    return client.payrollItem.deleteMany({ where: { companyId, runId } });
  },

  /** Sums of each money column per run. */
  async totalsByRun(companyId: string, runIds: readonly string[], client: DbClient = db) {
    const rows = await client.payrollItem.groupBy({
      by: ["runId"],
      where: { companyId, runId: { in: [...runIds] } },
      _sum: SUMS,
      _count: { _all: true },
    });
    return rows.map((row) => ({ runId: row.runId, count: row._count._all, sums: row._sum }));
  },

  /** An employee's payslips in approved or paid runs, newest first (payroll history). */
  listEmployeeItems(companyId: string, employeeId: string, client: DbClient = db) {
    return client.payrollItem.findMany({
      where: { companyId, employeeId, run: { status: { in: ["APPROVED", "PAID"] } } },
      select: { ...itemSelect, run: { select: runSelect } },
      orderBy: [{ run: { periodYear: "desc" } }, { run: { periodMonth: "desc" } }],
      take: 120,
    });
  },

  /** Approved and paid runs whose month lies in [from, to] (reports). */
  listReportRuns(companyId: string, months: { from: string; to: string }, client: DbClient = db) {
    const [fromYear = 0, fromMonth = 0] = months.from.split("-").map(Number);
    const [toYear = 0, toMonth = 0] = months.to.split("-").map(Number);
    return client.payrollRun.findMany({
      where: {
        companyId,
        status: { in: ["APPROVED", "PAID"] },
        AND: [
          {
            OR: [{ periodYear: { gt: fromYear } }, { periodYear: fromYear, periodMonth: { gte: fromMonth } }],
          },
          { OR: [{ periodYear: { lt: toYear } }, { periodYear: toYear, periodMonth: { lte: toMonth } }] },
        ],
      },
      select: runSelect,
      orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }],
    });
  },

  /** Items of several runs (reports: by department, tax per employee). */
  listItemsOfRuns(companyId: string, runIds: readonly string[], client: DbClient = db) {
    return client.payrollItem.findMany({
      where: { companyId, runId: { in: [...runIds] } },
      select: itemSelect,
    });
  },
};
