import type { Prisma } from "@/generated/prisma/client";
import { parseRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import type { SupplierListQuery } from "@/lib/validation";
import { createdBy, pageArgs, toPage, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  number: true,
  name: true,
  companyName: true,
  phone: true,
  email: true,
  address: true,
  taxId: true,
  notes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  _count: { select: { products: { where: { deletedAt: null } } } },
} as const;

export type SupplierData = Pick<
  Prisma.SupplierUncheckedCreateInput,
  "name" | "companyName" | "phone" | "email" | "address" | "taxId" | "notes" | "isActive"
>;

export const supplierRepository = {
  async list(companyId: string, query: SupplierListQuery, client: DbClient = db) {
    const search = query.search?.trim();
    const number = search ? parseRecordNumber("supplier", search) : undefined;
    const where: Prisma.SupplierWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.inactive ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { companyName: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              ...(number === undefined ? [] : [{ number }]),
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      client.supplier.findMany({ where, select, orderBy: [{ name: "asc" }], ...pageArgs(query) }),
      client.supplier.count({ where }),
    ]);
    return toPage(items, total, query);
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.supplier.findFirst({ where: { id, companyId, deletedAt: null }, select });
  },

  /** Active suppliers to choose from. */
  options(companyId: string, client: DbClient = db) {
    return client.supplier.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: { id: true, number: true, name: true },
      orderBy: { name: "asc" },
      take: 1000,
    });
  },

  create(companyId: string, number: number, data: SupplierData, actorId: ActorId, client: DbClient = db) {
    return client.supplier.create({ data: { ...data, number, companyId, ...createdBy(actorId) }, select });
  },

  async update(companyId: string, id: string, data: SupplierData, actorId: ActorId, client: DbClient = db) {
    const { count } = await client.supplier.updateMany({
      where: { id, companyId, deletedAt: null },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Soft delete — only a supplier without purchase orders or bills (deactivate it otherwise). */
  softDelete(companyId: string, id: string, actorId: ActorId, client: DbClient = db) {
    return client.supplier.updateMany({
      where: { id, companyId, deletedAt: null, purchaseOrders: { none: {} }, invoices: { none: {} } },
      data: { deletedAt: new Date(), ...updatedBy(actorId) },
    });
  },
};
