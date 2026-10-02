import "server-only";
import { formatRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  adjustmentDelta,
  compareQuantity,
  isLowStock,
  negateQuantity,
  quantity,
  sumQuantities,
  trimQuantity,
} from "@/lib/inventory";
import { money } from "@/lib/money";
import { authorize, type TenantContext } from "@/lib/tenant";
import type { StockMovementListQuery, StockOperationInput } from "@/lib/validation";
import type { ActorId, DbClient } from "@/server/repositories/helpers";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { productRepository } from "@/server/repositories/product.repository";
import { stockRepository, type StockMovementData } from "@/server/repositories/stock.repository";
import { writeAuditLog } from "./audit.service";
import { notify } from "./notification.service";
import { warehouseService } from "./warehouse.service";

/**
 * Stock operations and the inventory history (`STK-0001`). Every change to stock is a stock movement — there is no
 * other way to change it:
 * - Stock in / stock out / transfer: `inventory:create`; adjustment (set to a counted quantity): `inventory:edit`.
 * - Goods received from purchase orders add stock through the same function (purchase-order.service.ts).
 * - The product row is locked while stock is checked and written, so two stock-outs can't oversell; the database
 *   refuses negative stock and any change to a recorded movement as a last line of defence.
 */

/** Writes one movement with the next STK number. Callers hold the product lock when stock goes down. */
export async function recordMovement(
  companyId: string,
  actorId: ActorId,
  data: StockMovementData,
  client: DbClient,
) {
  const number = await numberSequenceRepository.next(companyId, "stock", client);
  return stockRepository.create(companyId, number, data, actorId, client);
}

function notEnough(onHand: string, unit: string): never {
  throw new ValidationError(`Not enough stock: only ${trimQuantity(onHand)} ${unit} in this warehouse.`, {
    quantity: [`Only ${trimQuantity(onHand)} ${unit} in stock.`],
  });
}

export const stockService = {
  async list(ctx: TenantContext, query: StockMovementListQuery) {
    authorize(ctx, "inventory:view");
    return stockRepository.list(ctx.companyId, query);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "inventory:view");
    const movement = await stockRepository.findById(ctx.companyId, id);
    if (!movement) throw new NotFoundError("Stock movement");
    return movement;
  },

  /** Stock per product and warehouse as `{ productId: { warehouseId: quantity } }` (hints on the stock form). */
  async levelMap(ctx: TenantContext) {
    authorize(ctx, "inventory:view");
    const map: Record<string, Record<string, string>> = {};
    for (const level of await stockRepository.levels(ctx.companyId)) {
      map[level.productId] = { ...map[level.productId], [level.warehouseId]: quantity(level.quantity) };
    }
    return map;
  },

  /** Records a stock in, stock out, adjustment or transfer. Returns the movements written. */
  async record(ctx: TenantContext, input: StockOperationInput) {
    authorize(ctx, input.operation === "ADJUST" ? "inventory:edit" : "inventory:create");
    const product = await productRepository.findById(ctx.companyId, input.productId);
    if (!product || !product.isActive) {
      throw new ValidationError("Choose an active product.", { productId: ["Choose an active product."] });
    }
    const warehouse = await warehouseService.active(ctx, input.warehouseId);
    const target =
      input.operation === "TRANSFER" && input.toWarehouseId
        ? await warehouseService.active(ctx, input.toWarehouseId, "toWarehouseId")
        : null;
    const amount = quantity(input.quantity);
    const base = {
      productId: product.id,
      warehouseId: warehouse.id,
      movementDate: dateOnlyToDate(input.movementDate),
      reference: input.reference || null,
      note: input.note || null,
    };

    return db.$transaction(async (tx) => {
      if (!(await productRepository.lock(ctx.companyId, product.id, tx))) throw new NotFoundError("Product");
      const onHand = quantity(await stockRepository.onHand(ctx.companyId, product.id, warehouse.id, tx));
      const totalBefore = quantity(
        (await stockRepository.totals(ctx.companyId, { productIds: [product.id] }, tx)).get(product.id) ??
          "0",
      );
      const movements: StockMovementData[] = [];
      let summary: string;

      switch (input.operation) {
        case "IN":
          movements.push({
            ...base,
            type: "STOCK_IN",
            quantity: amount,
            unitCost: money(input.unitCost || product.purchasePrice),
          });
          summary = `+${trimQuantity(amount)} ${product.unit} in ${warehouse.name}`;
          break;
        case "OUT":
          if (compareQuantity(amount, onHand) > 0) notEnough(onHand, product.unit);
          movements.push({ ...base, type: "STOCK_OUT", quantity: negateQuantity(amount), unitCost: null });
          summary = `−${trimQuantity(amount)} ${product.unit} from ${warehouse.name}`;
          break;
        case "ADJUST": {
          const delta = adjustmentDelta(onHand, amount);
          if (delta === null) {
            throw new ValidationError("The counted quantity is already the stock — nothing to adjust.", {
              quantity: [`Stock is already ${trimQuantity(onHand)} ${product.unit}.`],
            });
          }
          movements.push({ ...base, type: "ADJUSTMENT", quantity: delta, unitCost: null });
          summary = `${trimQuantity(onHand)} → ${trimQuantity(amount)} ${product.unit} in ${warehouse.name}`;
          break;
        }
        case "TRANSFER": {
          if (!target) throw new ValidationError("Choose the warehouse to move the stock to.");
          if (compareQuantity(amount, onHand) > 0) notEnough(onHand, product.unit);
          const transferId = crypto.randomUUID();
          movements.push(
            { ...base, type: "TRANSFER_OUT", quantity: negateQuantity(amount), unitCost: null, transferId },
            {
              ...base,
              warehouseId: target.id,
              type: "TRANSFER_IN",
              quantity: amount,
              unitCost: null,
              transferId,
            },
          );
          summary = `${trimQuantity(amount)} ${product.unit}: ${warehouse.name} → ${target.name}`;
          break;
        }
      }

      const written = [];
      for (const movement of movements)
        written.push(await recordMovement(ctx.companyId, ctx.userId, movement, tx));
      await writeAuditLog(
        ctx,
        {
          action: `stock.${input.operation === "ADJUST" ? "adjust" : input.operation.toLowerCase()}`,
          entityType: "Product",
          entityId: product.id,
          after: written.map((movement) => ({
            code: formatRecordNumber("stock", movement.number),
            type: movement.type,
            warehouseId: movement.warehouseId,
            quantity: quantity(movement.quantity),
          })),
          metadata: {
            summary,
            reference: base.reference,
          },
        },
        tx,
      );
      // Low-inventory alert when this movement takes the product (all warehouses) to or below its minimum.
      const minimum = quantity(product.minimumStock);
      const totalAfter = sumQuantities([
        totalBefore,
        ...written.map((movement) => quantity(movement.quantity)),
      ]);
      if (!isLowStock(totalBefore, minimum) && isLowStock(totalAfter, minimum)) {
        await notify(
          ctx.companyId,
          {
            type: "inventory.low_stock",
            title: `Low stock: ${product.name}`,
            body: `${product.sku}: ${trimQuantity(totalAfter)} ${product.unit} left (minimum ${trimQuantity(minimum)}).`,
            link: `/inventory/products/${product.id}`,
            entityType: "Product",
            entityId: product.id,
          },
          tx,
        );
      }
      return written;
    });
  },
};
