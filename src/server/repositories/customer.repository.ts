import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { CustomerInput, PaginationInput } from "@/lib/validation";

export const customerRepository = {
  async list(organizationId: string, { page, pageSize, search }: PaginationInput) {
    const where: Prisma.CustomerWhereInput = {
      organizationId,
      deletedAt: null,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    };
    const [items, total] = await Promise.all([
      db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      db.customer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },

  findById(organizationId: string, id: string) {
    return db.customer.findFirst({ where: { id, organizationId, deletedAt: null } });
  },

  create(organizationId: string, data: CustomerInput, tx: Prisma.TransactionClient = db) {
    return tx.customer.create({ data: { ...data, organizationId } });
  },

  update(id: string, data: Partial<CustomerInput>, tx: Prisma.TransactionClient = db) {
    return tx.customer.update({ where: { id }, data });
  },

  softDelete(id: string, tx: Prisma.TransactionClient = db) {
    return tx.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  },
};
