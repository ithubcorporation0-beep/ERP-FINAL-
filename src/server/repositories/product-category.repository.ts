import { db } from "@/lib/db";
import { createdBy, updatedBy, type ActorId, type DbClient } from "./helpers";

const select = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  _count: { select: { products: { where: { deletedAt: null } } } },
} as const;

export interface ProductCategoryData {
  name: string;
  description: string | null;
}

export const productCategoryRepository = {
  list(companyId: string, client: DbClient = db) {
    return client.productCategory.findMany({ where: { companyId }, orderBy: { name: "asc" }, select });
  },

  findById(companyId: string, id: string, client: DbClient = db) {
    return client.productCategory.findFirst({ where: { id, companyId }, select });
  },

  findByName(companyId: string, name: string, client: DbClient = db) {
    return client.productCategory.findFirst({
      where: { companyId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
  },

  create(companyId: string, data: ProductCategoryData, actorId: ActorId, client: DbClient = db) {
    return client.productCategory.create({ data: { ...data, companyId, ...createdBy(actorId) }, select });
  },

  async update(
    companyId: string,
    id: string,
    data: ProductCategoryData,
    actorId: ActorId,
    client: DbClient = db,
  ) {
    const { count } = await client.productCategory.updateMany({
      where: { id, companyId },
      data: { ...data, ...updatedBy(actorId) },
    });
    return count > 0;
  },

  /** Deletes a category no product (not even a deleted one) uses; returns how many were deleted. */
  delete(companyId: string, id: string, client: DbClient = db) {
    return client.productCategory.deleteMany({ where: { id, companyId, products: { none: {} } } });
  },
};
