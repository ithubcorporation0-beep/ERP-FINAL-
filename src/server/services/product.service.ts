import "server-only";
import { formatRecordNumber } from "@/config/records";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  compareQuantity,
  isLowStock,
  lineAmount,
  quantity,
  remainingToReceive,
  shortfall,
  stockStatus,
  sumQuantities,
} from "@/lib/inventory";
import { money, sumMoney } from "@/lib/money";
import { hasAnyPermission } from "@/lib/permissions";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { ProductInput, ProductListQuery } from "@/lib/validation";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { productCategoryRepository } from "@/server/repositories/product-category.repository";
import { productRepository, type ProductData } from "@/server/repositories/product.repository";
import { purchaseOrderRepository } from "@/server/repositories/purchase-order.repository";
import { stockRepository } from "@/server/repositories/stock.repository";
import { supplierRepository } from "@/server/repositories/supplier.repository";
import { warehouseRepository } from "@/server/repositories/warehouse.repository";
import { writeAuditLog } from "./audit.service";
import { recordHistory, snapshotText } from "./record-history";
import { salesContext } from "./sales-shared";

/**
 * Products (`PRD-0001`) and their stock. `products:view` to read (including stock levels); `products:create` /
 * `edit` / `delete` to change. Stock is never stored on the product: it is the sum of its stock movements
 * (src/lib/inventory.ts, docs/inventory.md), so it can only change by recording a movement.
 */

type Product = NonNullable<Awaited<ReturnType<typeof productRepository.findById>>>;

function snapshot(product: Product) {
  return {
    code: formatRecordNumber("product", product.number),
    sku: product.sku,
    name: product.name,
    categoryId: product.categoryId,
    brand: product.brand,
    unit: product.unit,
    purchasePrice: money(product.purchasePrice),
    sellingPrice: money(product.sellingPrice),
    minimumStock: quantity(product.minimumStock),
    supplierId: product.supplierId,
    warehouseId: product.warehouseId,
    description: product.description,
    isActive: product.isActive,
  };
}

/** Stock figures of a product from its on-hand quantity. */
function stockFigures(onHand: string, minimum: { toString(): string }) {
  const minimumStock = quantity(minimum);
  return {
    onHand: quantity(onHand),
    status: stockStatus(onHand, minimumStock),
    low: isLowStock(onHand, minimumStock),
    shortfall: shortfall(onHand, minimumStock),
  };
}

const HISTORY_ACTIONS: Record<string, string> = {
  "product.create": "Created",
  "product.update": "Updated",
  "product.delete": "Deleted",
  "stock.in": "Stock in",
  "stock.out": "Stock out",
  "stock.adjust": "Stock adjusted",
  "stock.transfer": "Stock transferred",
  "stock.receipt": "Goods received",
};

export const productService = {
  async list(ctx: TenantContext, query: ProductListQuery) {
    authorize(ctx, "products:view");
    let ids: string[] | undefined;
    if (query.stock) {
      // Stock depends on movement sums, so the low / out-of-stock set is computed first, then paged in SQL.
      const [thresholds, totals] = await Promise.all([
        productRepository.thresholds(ctx.companyId),
        stockRepository.totals(ctx.companyId, { warehouseId: query.warehouseId }),
      ]);
      ids = thresholds
        .filter((product) => {
          const onHand = totals.get(product.id) ?? "0";
          return query.stock === "out"
            ? compareQuantity(onHand, "0") <= 0
            : isLowStock(onHand, quantity(product.minimumStock));
        })
        .map((product) => product.id);
    }
    const page = await productRepository.list(ctx.companyId, { ...query, ids });
    const totals = await stockRepository.totals(ctx.companyId, {
      productIds: page.items.map((product) => product.id),
      warehouseId: query.warehouseId,
    });
    return {
      ...page,
      items: page.items.map((product) => ({
        ...product,
        stock: stockFigures(totals.get(product.id) ?? "0", product.minimumStock),
      })),
    };
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "products:view");
    const product = await productRepository.findById(ctx.companyId, id);
    if (!product) throw new NotFoundError("Product");
    return product;
  },

  /** The product with its stock in every warehouse, what is on order, and its stock value. */
  async detail(ctx: TenantContext, id: string) {
    const product = await this.get(ctx, id);
    const [levels, warehouses, open] = await Promise.all([
      stockRepository.levels(ctx.companyId, [id]),
      warehouseRepository.list(ctx.companyId),
      purchaseOrderRepository.openQuantities(ctx.companyId),
    ]);
    const onHand = sumQuantities(levels.map((level) => level.quantity));
    const onOrder = sumQuantities(
      open
        .filter((line) => line.productId === id)
        .map((line) =>
          remainingToReceive(
            quantity(line.quantity),
            sumQuantities(line.receiptItems.map((item) => quantity(item.quantity))),
          ),
        ),
    );
    return {
      ...product,
      stock: stockFigures(onHand, product.minimumStock),
      onOrder,
      value: lineAmount(onHand, money(product.purchasePrice)),
      warehouses: warehouses
        .map((warehouse) => ({
          id: warehouse.id,
          name: warehouse.name,
          isActive: warehouse.isActive,
          onHand: quantity(levels.find((level) => level.warehouseId === warehouse.id)?.quantity ?? "0"),
        }))
        .filter((row) => row.isActive || compareQuantity(row.onHand, "0") !== 0),
    };
  },

  /** Active products to choose from (stock operations, purchase requests and orders). */
  async options(ctx: TenantContext) {
    if (!hasAnyPermission(ctx.permissions, ["inventory:view", "purchases:view"]))
      authorize(ctx, "products:view");
    return productRepository.options(ctx.companyId);
  },

  /** Categories, suppliers and warehouses to choose from on the product form. */
  async formOptions(ctx: TenantContext) {
    if (!hasAnyPermission(ctx.permissions, ["products:create"])) authorize(ctx, "products:edit");
    const [categories, suppliers, warehouses] = await Promise.all([
      productCategoryRepository.list(ctx.companyId),
      supplierRepository.options(ctx.companyId),
      warehouseRepository.list(ctx.companyId),
    ]);
    return {
      categories: categories.map((category) => ({ value: category.id, label: category.name })),
      suppliers: suppliers.map((supplier) => ({
        value: supplier.id,
        label: `${supplier.name} · ${formatRecordNumber("supplier", supplier.number)}`,
      })),
      warehouses: warehouses
        .filter((warehouse) => warehouse.isActive)
        .map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
    };
  },

  /** Category, supplier and warehouse must belong to this company; the SKU must be unused. */
  async data(ctx: TenantContext, input: ProductInput, before?: Product): Promise<ProductData> {
    const sku = await productRepository.findBySku(ctx.companyId, input.sku);
    if (sku && sku.id !== before?.id) {
      throw new ValidationError("Another product already uses this SKU.", {
        sku: [sku.deletedAt ? "Used by a deleted product." : "Already used by another product."],
      });
    }
    const categoryId = input.categoryId || null;
    if (categoryId && !(await productCategoryRepository.findById(ctx.companyId, categoryId))) {
      throw new ValidationError("Choose a category.", { categoryId: ["Choose a category of this company."] });
    }
    const supplierId = input.supplierId || null;
    if (supplierId && supplierId !== before?.supplierId) {
      const supplier = await supplierRepository.findById(ctx.companyId, supplierId);
      if (!supplier || !supplier.isActive) {
        throw new ValidationError("Choose an active supplier.", {
          supplierId: ["Choose an active supplier."],
        });
      }
    }
    const warehouseId = input.warehouseId || null;
    if (warehouseId && warehouseId !== before?.warehouseId) {
      const warehouse = await warehouseRepository.findById(ctx.companyId, warehouseId);
      if (!warehouse || !warehouse.isActive) {
        throw new ValidationError("Choose an active warehouse.", {
          warehouseId: ["Choose an active warehouse."],
        });
      }
    }
    return {
      sku: input.sku,
      name: input.name,
      categoryId,
      brand: input.brand || null,
      unit: input.unit,
      purchasePrice: money(input.purchasePrice),
      sellingPrice: money(input.sellingPrice),
      minimumStock: quantity(input.minimumStock),
      supplierId,
      warehouseId,
      description: input.description || null,
      isActive: input.isActive ?? before?.isActive ?? true,
    };
  },

  async create(ctx: TenantContext, input: ProductInput) {
    authorize(ctx, "products:create");
    const data = await this.data(ctx, input);
    return db.$transaction(async (tx) => {
      const number = await numberSequenceRepository.next(ctx.companyId, "product", tx);
      const product = await productRepository.create(ctx.companyId, number, data, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        { action: "product.create", entityType: "Product", entityId: product.id, after: snapshot(product) },
        tx,
      );
      return product;
    });
  },

  async update(ctx: TenantContext, id: string, input: ProductInput) {
    authorize(ctx, "products:edit");
    const before = await this.get(ctx, id);
    const data = await this.data(ctx, input, before);
    await db.$transaction(async (tx) => {
      if (!(await productRepository.update(ctx.companyId, id, data, ctx.userId, tx)))
        throw new NotFoundError("Product");
      const after = await productRepository.findById(ctx.companyId, id, tx);
      if (!after) throw new NotFoundError("Product");
      await writeAuditLog(
        ctx,
        {
          action: "product.update",
          entityType: "Product",
          entityId: id,
          before: snapshot(before),
          after: snapshot(after),
        },
        tx,
      );
    });
  },

  /** Deletes (soft) a product with no stock left. Its history stays; the SKU stays reserved. */
  async remove(ctx: TenantContext, id: string) {
    authorize(ctx, "products:delete");
    const product = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      if (!(await productRepository.lock(ctx.companyId, id, tx))) throw new NotFoundError("Product");
      const totals = await stockRepository.totals(ctx.companyId, { productIds: [id] }, tx);
      if (compareQuantity(totals.get(id) ?? "0", "0") !== 0) {
        throw new ConflictError(
          "This product still has stock. Record a stock out or adjustment to zero first, or deactivate it.",
        );
      }
      await productRepository.softDelete(ctx.companyId, id, ctx.userId, tx);
      await writeAuditLog(
        ctx,
        { action: "product.delete", entityType: "Product", entityId: id, before: snapshot(product) },
        tx,
      );
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "Product", id, {
      actions: HISTORY_ACTIONS,
      fields: {
        sku: "SKU",
        name: "name",
        categoryId: "category",
        brand: "brand",
        unit: "unit",
        purchasePrice: "purchase price",
        sellingPrice: "selling price",
        minimumStock: "minimum stock",
        supplierId: "supplier",
        warehouseId: "warehouse",
        description: "description",
        isActive: "active",
      },
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },

  /**
   * Low-stock detection: active products with a minimum stock whose total stock (all warehouses) is at or below it,
   * most urgent (largest shortfall relative to nothing on hand) first.
   */
  async lowStock(ctx: TenantContext) {
    authorize(ctx, "products:view");
    return this.lowStockFor(ctx.companyId);
  },

  /** Low-stock products of a company (no permission check — callers check; used by the dashboard). */
  async lowStockFor(companyId: string) {
    const [thresholds, totals] = await Promise.all([
      productRepository.thresholds(companyId),
      stockRepository.totals(companyId),
    ]);
    const low = thresholds.filter((product) =>
      isLowStock(totals.get(product.id) ?? "0", quantity(product.minimumStock)),
    );
    if (low.length === 0) return [];
    const products = await productRepository.findMany(
      companyId,
      low.map((product) => product.id),
    );
    return products
      .map((product) => ({
        ...product,
        stock: stockFigures(totals.get(product.id) ?? "0", product.minimumStock),
      }))
      .sort((a, b) => compareQuantity(a.stock.onHand, b.stock.onHand) || a.name.localeCompare(b.name));
  },

  /** Stock valuation at purchase price, per product and in total (inventory report). */
  async valuation(ctx: TenantContext) {
    authorize(ctx, "products:view");
    const [page, totals, { currency }] = await Promise.all([
      productRepository.list(ctx.companyId, { page: 1, pageSize: 5000, inactive: "1" }),
      stockRepository.totals(ctx.companyId),
      salesContext(ctx),
    ]);
    const rows = page.items
      .map((product) => {
        const onHand = quantity(totals.get(product.id) ?? "0");
        return {
          ...product,
          stock: stockFigures(onHand, product.minimumStock),
          value: lineAmount(onHand, money(product.purchasePrice)),
        };
      })
      .filter((row) => compareQuantity(row.stock.onHand, "0") !== 0 || row.isActive);
    return { currency, rows, total: sumMoney(rows.map((row) => row.value)) };
  },

  async forSupplier(ctx: TenantContext, supplierId: string) {
    authorize(ctx, "products:view");
    const products = await productRepository.listForSupplier(ctx.companyId, supplierId);
    const totals = await stockRepository.totals(ctx.companyId, {
      productIds: products.map((product) => product.id),
    });
    return products.map((product) => ({
      ...product,
      stock: stockFigures(totals.get(product.id) ?? "0", product.minimumStock),
    }));
  },
};
