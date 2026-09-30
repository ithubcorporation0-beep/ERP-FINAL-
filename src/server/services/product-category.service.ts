import "server-only";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { ProductCategoryInput } from "@/lib/validation";
import { productCategoryRepository } from "@/server/repositories/product-category.repository";
import { writeAuditLog } from "./audit.service";

/** Product categories: reading needs `products:view`; create / edit / delete `products:create` / `edit` / `delete`. */
export const productCategoryService = {
  async list(ctx: TenantContext) {
    authorize(ctx, "products:view");
    return productCategoryRepository.list(ctx.companyId);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "products:view");
    const category = await productCategoryRepository.findById(ctx.companyId, id);
    if (!category) throw new NotFoundError("Category");
    return category;
  },

  async assertUniqueName(ctx: TenantContext, name: string, exceptId?: string) {
    const existing = await productCategoryRepository.findByName(ctx.companyId, name);
    if (existing && existing.id !== exceptId) {
      throw new ValidationError("A category with this name already exists.", { name: ["Already exists."] });
    }
  },

  async create(ctx: TenantContext, input: ProductCategoryInput) {
    authorize(ctx, "products:create");
    await this.assertUniqueName(ctx, input.name);
    return db.$transaction(async (tx) => {
      const category = await productCategoryRepository.create(
        ctx.companyId,
        { name: input.name, description: input.description || null },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "product_category.create",
          entityType: "ProductCategory",
          entityId: category.id,
          after: { name: category.name, description: category.description },
        },
        tx,
      );
      return category;
    });
  },

  async update(ctx: TenantContext, id: string, input: ProductCategoryInput) {
    authorize(ctx, "products:edit");
    const before = await this.get(ctx, id);
    await this.assertUniqueName(ctx, input.name, id);
    await db.$transaction(async (tx) => {
      const data = { name: input.name, description: input.description || null };
      if (!(await productCategoryRepository.update(ctx.companyId, id, data, ctx.userId, tx)))
        throw new NotFoundError("Category");
      await writeAuditLog(
        ctx,
        {
          action: "product_category.update",
          entityType: "ProductCategory",
          entityId: id,
          before: { name: before.name, description: before.description },
          after: data,
        },
        tx,
      );
    });
  },

  /** Only an unused category can be deleted. */
  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "products:delete");
    const category = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const { count } = await productCategoryRepository.delete(ctx.companyId, id, tx);
      if (count === 0) throw new ConflictError("Categories with products can't be deleted.");
      await writeAuditLog(
        ctx,
        {
          action: "product_category.delete",
          entityType: "ProductCategory",
          entityId: id,
          before: { name: category.name },
        },
        tx,
      );
    });
  },
};
