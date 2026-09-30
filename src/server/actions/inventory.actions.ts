"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission, requireTenant } from "@/lib/tenant";
import {
  idSchema,
  productCategorySchema,
  productSchema,
  stockOperationSchema,
  warehouseSchema,
} from "@/lib/validation";
import { productCategoryService } from "@/server/services/product-category.service";
import { productService } from "@/server/services/product.service";
import { stockService } from "@/server/services/stock.service";
import { warehouseService } from "@/server/services/warehouse.service";

function revalidateInventory() {
  revalidatePath("/inventory", "layout");
  revalidatePath("/dashboard");
}

export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("products:create");
    const product = await productService.create(ctx, productSchema.parse(input));
    revalidateInventory();
    return { id: product.id };
  });
}

export async function updateProductAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products:edit");
    await productService.update(ctx, idSchema.parse(id), productSchema.parse(input));
    revalidateInventory();
  });
}

export async function deleteProductAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products:delete");
    await productService.remove(ctx, idSchema.parse(id));
    revalidateInventory();
  });
}

/** Stock in / out / adjustment / transfer (the service checks inventory:create or inventory:edit). */
export async function recordStockAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const ctx = await requireTenant();
    const movements = await stockService.record(ctx, stockOperationSchema.parse(input));
    revalidateInventory();
    return { count: movements.length };
  });
}

export async function createCategoryAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products:create");
    await productCategoryService.create(ctx, productCategorySchema.parse(input));
    revalidateInventory();
  });
}

export async function updateCategoryAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products:edit");
    await productCategoryService.update(ctx, idSchema.parse(id), productCategorySchema.parse(input));
    revalidateInventory();
  });
}

export async function deleteCategoryAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("products:delete");
    await productCategoryService.remove(ctx, idSchema.parse(id));
    revalidateInventory();
  });
}

export async function createWarehouseAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory:create");
    await warehouseService.create(ctx, warehouseSchema.parse(input));
    revalidateInventory();
  });
}

export async function updateWarehouseAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory:edit");
    await warehouseService.update(ctx, idSchema.parse(id), warehouseSchema.parse(input));
    revalidateInventory();
  });
}

export async function deleteWarehouseAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("inventory:delete");
    await warehouseService.remove(ctx, idSchema.parse(id));
    revalidateInventory();
  });
}
