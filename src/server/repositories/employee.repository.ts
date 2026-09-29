import type { EmploymentStatus, Prisma } from "@/generated/prisma/client";
import { WORKFORCE_STATUSES } from "@/config/hr";
import { parseRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import type { EmployeeListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

/** Profile fields only — salary and bank details are never selected here (see compensation.repository.ts). */
const select = {
  id: true,
  number: true,
  userId: true,
  name: true,
  email: true,
  phone: true,
  identificationNumber: true,
  departmentId: true,
  position: true,
  joiningDate: true,
  status: true,
  exitDate: true,
  photoKey: true,
  photoContentType: true,
  photoUpdatedAt: true,
  emergencyContactName: true,
  emergencyContactRelation: true,
  emergencyContactPhone: true,
  notes: true,
  createdAt: true,
  department: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
} as const;

export type EmployeeData = Pick<
  Prisma.EmployeeUncheckedCreateInput,
  | "userId"
  | "name"
  | "email"
  | "phone"
  | "identificationNumber"
  | "departmentId"
  | "position"
  | "joiningDate"
  | "emergencyContactName"
  | "emergencyContactRelation"
  | "emergencyContactPhone"
  | "notes"
>;

const WORKFORCE: EmploymentStatus[] = [...WORKFORCE_STATUSES];

export const employeeRepository = {
  async list(companyId: string, query: EmployeeListQuery, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("employee", search) : undefined;
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.status === "current"
        ? { status: { in: WORKFORCE } }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { position: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.employee.findMany({
        where,
        select,
        orderBy: [{ name: "asc" }, { number: "asc" }],
        ...pageArgs(query),
      }),
      client.employee.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.employee.findFirst({ where: { id, companyId, deletedAt: null }, select });
  },

  /** The employee record a signed-in member uses for self-service. */
  findByUser(companyId: string, userId: string, client: DbClient = db) {
    return client.employee.findFirst({ where: { companyId, userId, deletedAt: null }, select });
  },

  /** Any record (even deleted) already linked to this user — the link is unique per company. */
  findLinkedUser(companyId: string, userId: string, client: DbClient = db) {
    return client.employee.findFirst({ where: { companyId, userId }, select: { id: true, deletedAt: true } });
  },

  create(
    companyId: string,
    number: number,
    data: EmployeeData & { status: EmploymentStatus },
    actorId: ActorId,
    client: DbClient = db,
  ) {
    return client.employee.create({ data: { ...data, number, companyId, ...createdBy(actorId) }, select });
  },

  async update(
    companyId: string,
    id: string,
    data: Prisma.EmployeeUncheckedUpdateManyInput,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.employee.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Soft delete; the user link is released so the login can be linked to another record. */
  softDelete(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.employee.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { deletedAt: new Date(), userId: null, ...updatedBy(actorId) },
    });
  },

  /** Employees to pick from (not deleted), current workforce first by name. */
  options(companyId: string, client: DbClient = db) {
    return client.employee.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, number: true, name: true, status: true },
      orderBy: [{ name: "asc" }],
    });
  },

  /** Everyone who may be expected at work on some day in [from, to] — attendance applies `employedOn` per day. */
  listForAttendance(
    companyId: string,
    dates: { from: string; to: string },
    filter: { departmentId?: string; employeeId?: string } = {},
    client: DbClient = db,
  ) {
    return client.employee.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { not: "SUSPENDED" },
        joiningDate: { lte: dateOnlyToDate(dates.to) },
        OR: [{ exitDate: null }, { exitDate: { gte: dateOnlyToDate(dates.from) } }],
        ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
        ...(filter.employeeId ? { id: filter.employeeId } : {}),
      },
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        joiningDate: true,
        exitDate: true,
        department: { select: { name: true } },
      },
      orderBy: [{ name: "asc" }],
    });
  },

  /** Current workforce (probation, active, on notice); optionally only those who joined in [from, to). */
  countWorkforce(companyId: string, joined: { from?: string; to?: string } = {}, client: DbClient = db) {
    return client.employee.count({
      where: {
        companyId,
        deletedAt: null,
        status: { in: WORKFORCE },
        ...(joined.from || joined.to
          ? {
              joiningDate: {
                ...(joined.from ? { gte: dateOnlyToDate(joined.from) } : {}),
                ...(joined.to ? { lt: dateOnlyToDate(joined.to) } : {}),
              },
            }
          : {}),
      },
    });
  },

  listRecent(companyId: string, limit: number, client: DbClient = db) {
    return client.employee.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, number: true, name: true, position: true, createdAt: true },
    });
  },

  /**
   * Locks the employee row until the transaction ends, so two leave requests for the same person are checked for
   * overlap one after the other. Raw SQL (Prisma has no FOR UPDATE); scoped by company explicitly.
   */
  async lock(companyId: string, id: string, client: DbClient) {
    const rows = await client.$queryRaw<{ id: string }[]>`
      SELECT id FROM employees WHERE id = ${id}::uuid AND company_id = ${companyId}::uuid AND deleted_at IS NULL
      FOR UPDATE`;
    return rows.length > 0;
  },
};
