import "server-only";
import { PURCHASE_ORDER_STATUS_LABELS, RECEIVABLE_ORDER_STATUSES } from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { dateOnlyToDate } from "@/lib/date-range";
import { db } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  compareQuantity,
  lineAmount,
  quantity,
  receiptStatus,
  remainingToReceive,
  sumQuantities,
  trimQuantity,
} from "@/lib/inventory";
import { money, sumMoney } from "@/lib/money";
import { authorize, can, type TenantContext } from "@/lib/tenant";
import type { GoodsReceiptInput, PurchaseOrderInput, PurchaseOrderListQuery } from "@/lib/validation";
import { numberSequenceRepository } from "@/server/repositories/number-sequence.repository";
import { productRepository } from "@/server/repositories/product.repository";
import {
  purchaseOrderRepository,
  type PurchaseOrderData,
  type PurchaseOrderLine,
} from "@/server/repositories/purchase-order.repository";
import { purchaseRequestRepository } from "@/server/repositories/purchase-request.repository";
import { supplierRepository } from "@/server/repositories/supplier.repository";
import { writeAuditLog } from "./audit.service";
import { recordHistory, snapshotText } from "./record-history";
import { salesContext } from "./sales-shared";
import { recordMovement } from "./stock.service";
import { warehouseService } from "./warehouse.service";

/**
 * Purchase orders (`PO-0001`) and goods received (`GRN-0001`).
 * - Draft → Ordered (sent to the supplier) → Partly received → Received; Draft or Ordered → Cancelled.
 * - `purchases:create` creates (optionally from an approved purchase request, which becomes Ordered);
 *   `purchases:edit` edits drafts and places orders; `purchases:delete` cancels (only before anything is received
 *   or billed).
 * - Receiving goods (`inventory:create`) adds stock through GOODS_RECEIPT stock movements in the same transaction,
 *   never more than is still open on each line; the order row is locked meanwhile.
 */

type PurchaseOrder = NonNullable<Awaited<ReturnType<typeof purchaseOrderRepository.findById>>>;

const HISTORY_ACTIONS: Record<string, string> = {
  "purchase_order.create": "Created",
  "purchase_order.update": "Updated",
  "purchase_order.order": "Ordered",
  "purchase_order.cancel": "Cancelled",
  "purchase_order.receive": "Goods received",
};

/** Received and remaining quantities per order line. */
function withReceived(order: PurchaseOrder) {
  const lines = order.items.map((item) => {
    const ordered = quantity(item.quantity);
    const received = sumQuantities(item.receiptItems.map((receipt) => quantity(receipt.quantity)));
    return { ...item, ordered, received, remaining: remainingToReceive(ordered, received) };
  });
  const billed = sumMoney(order.invoices.map((invoice) => money(invoice.subtotal)));
  return { ...order, lines, billed };
}

export const purchaseOrderService = {
  async list(ctx: TenantContext, query: PurchaseOrderListQuery) {
    authorize(ctx, "purchases:view");
    return purchaseOrderRepository.list(ctx.companyId, query);
  },

  async get(ctx: TenantContext, id: string) {
    authorize(ctx, "purchases:view");
    const order = await purchaseOrderRepository.findById(ctx.companyId, id);
    if (!order) throw new NotFoundError("Purchase order");
    return order;
  },

  async detail(ctx: TenantContext, id: string) {
    return withReceived(await this.get(ctx, id));
  },

  abilities(ctx: TenantContext, order: PurchaseOrder) {
    const receivable = RECEIVABLE_ORDER_STATUSES.includes(order.status);
    return {
      edit: order.status === "DRAFT" && can(ctx, "purchases:edit"),
      order: order.status === "DRAFT" && can(ctx, "purchases:edit"),
      cancel:
        (order.status === "DRAFT" || order.status === "ORDERED") &&
        order.receipts.length === 0 &&
        order.invoices.length === 0 &&
        can(ctx, "purchases:delete"),
      receive: receivable && can(ctx, "inventory:create"),
      bill: order.status !== "DRAFT" && order.status !== "CANCELLED" && can(ctx, "accounting:create"),
    };
  },

  /** Supplier, warehouse, products and (optionally) the approved request. */
  async resolve(ctx: TenantContext, input: PurchaseOrderInput, before?: PurchaseOrder) {
    const supplier = await supplierRepository.findById(ctx.companyId, input.supplierId);
    if (!supplier || (!supplier.isActive && supplier.id !== before?.supplierId)) {
      throw new ValidationError("Choose an active supplier.", { supplierId: ["Choose an active supplier."] });
    }
    if (input.warehouseId !== before?.warehouseId) await warehouseService.active(ctx, input.warehouseId);
    const products = await productRepository.findMany(
      ctx.companyId,
      input.items.map((item) => item.productId),
    );
    const lines: PurchaseOrderLine[] = input.items.map((item, index) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product || !product.isActive) {
        throw new ValidationError("Choose active products.", {
          [`items.${index}.productId`]: ["Choose an active product."],
        });
      }
      const qty = quantity(item.quantity);
      const unitPrice = money(item.unitPrice);
      return {
        productId: product.id,
        quantity: qty,
        unitPrice,
        lineTotal: lineAmount(qty, unitPrice),
        position: index,
      };
    });
    const requestId = input.requestId || null;
    if (requestId && requestId !== before?.requestId) {
      const request = await purchaseRequestRepository.findById(ctx.companyId, requestId);
      if (!request || request.status !== "APPROVED") {
        throw new ValidationError("Only an approved purchase request can be ordered.", {
          requestId: ["Choose an approved request."],
        });
      }
    }
    const data: PurchaseOrderData = {
      supplierId: supplier.id,
      warehouseId: input.warehouseId,
      requestId,
      orderDate: dateOnlyToDate(input.orderDate),
      expectedDate: input.expectedDate ? dateOnlyToDate(input.expectedDate) : null,
      notes: input.notes || null,
      total: sumMoney(lines.map((line) => line.lineTotal)),
    };
    return { data, lines };
  },

  async create(ctx: TenantContext, input: PurchaseOrderInput) {
    authorize(ctx, "purchases:create");
    const [{ data, lines }, { currency }] = await Promise.all([this.resolve(ctx, input), salesContext(ctx)]);
    return db.$transaction(async (tx) => {
      if (data.requestId) {
        // The request moves Approved → Ordered in the same transaction; a second order for it fails here.
        const ordered = await purchaseRequestRepository.setStatus(
          ctx.companyId,
          data.requestId,
          ["APPROVED"],
          { status: "ORDERED" },
          ctx.userId,
          tx,
        );
        if (!ordered)
          throw new ConflictError("This purchase request is no longer approved or was already ordered.");
      }
      const number = await numberSequenceRepository.next(ctx.companyId, "purchaseOrder", tx);
      const order = await purchaseOrderRepository.create(
        ctx.companyId,
        { number, currency },
        data,
        lines,
        ctx.userId,
        tx,
      );
      const code = formatRecordNumber("purchaseOrder", number);
      await writeAuditLog(
        ctx,
        {
          action: "purchase_order.create",
          entityType: "PurchaseOrder",
          entityId: order.id,
          after: { code, supplierId: data.supplierId, total: data.total, lines: lines.length },
        },
        tx,
      );
      if (data.requestId) {
        await writeAuditLog(
          ctx,
          {
            action: "purchase_request.order",
            entityType: "PurchaseRequest",
            entityId: data.requestId,
            before: { status: "APPROVED" },
            after: { status: "ORDERED" },
            metadata: { summary: code },
          },
          tx,
        );
      }
      return order;
    });
  },

  async update(ctx: TenantContext, id: string, input: PurchaseOrderInput) {
    authorize(ctx, "purchases:edit");
    const before = await this.get(ctx, id);
    if (before.status !== "DRAFT") throw new ConflictError("Only draft orders can be edited.");
    if ((input.requestId || null) !== before.requestId) {
      throw new ValidationError("The purchase request of an order can't be changed.", {
        requestId: ["Can't be changed."],
      });
    }
    const { data, lines } = await this.resolve(ctx, input, before);
    await db.$transaction(async (tx) => {
      if (!(await purchaseOrderRepository.replaceDraft(ctx.companyId, id, data, lines, ctx.userId, tx))) {
        throw new ConflictError("Only draft orders can be edited. Reload and try again.");
      }
      await writeAuditLog(
        ctx,
        {
          action: "purchase_order.update",
          entityType: "PurchaseOrder",
          entityId: id,
          before: { supplierId: before.supplierId, total: money(before.total), lines: before.items.length },
          after: { supplierId: data.supplierId, total: data.total, lines: lines.length },
        },
        tx,
      );
    });
  },

  /** Places a draft order with the supplier (Draft → Ordered). */
  async placeOrder(ctx: TenantContext, id: string) {
    authorize(ctx, "purchases:edit");
    const order = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const changed = await purchaseOrderRepository.setStatus(
        ctx.companyId,
        id,
        ["DRAFT"],
        { status: "ORDERED", orderedAt: new Date() },
        ctx.userId,
        tx,
      );
      if (!changed) throw new ConflictError("Only draft orders can be placed. Reload and try again.");
      await writeAuditLog(
        ctx,
        {
          action: "purchase_order.order",
          entityType: "PurchaseOrder",
          entityId: id,
          before: { status: order.status },
          after: { status: "ORDERED" },
        },
        tx,
      );
    });
  },

  /** Cancels an order nothing was received or billed for. Its purchase request (if any) is cancelled too. */
  async cancel(ctx: TenantContext, id: string, reason: string) {
    authorize(ctx, "purchases:delete");
    const order = await this.get(ctx, id);
    await db.$transaction(async (tx) => {
      const status = await purchaseOrderRepository.lock(ctx.companyId, id, tx);
      const locked = await purchaseOrderRepository.findById(ctx.companyId, id, tx);
      if (!locked || !status) throw new NotFoundError("Purchase order");
      if (locked.receipts.length > 0 || locked.invoices.length > 0) {
        throw new ConflictError("Goods were received or billed for this order, so it can't be cancelled.");
      }
      const changed = await purchaseOrderRepository.setStatus(
        ctx.companyId,
        id,
        ["DRAFT", "ORDERED"],
        { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
        ctx.userId,
        tx,
      );
      if (!changed) {
        throw new ConflictError(
          `A ${PURCHASE_ORDER_STATUS_LABELS[order.status].toLowerCase()} order can't be cancelled.`,
        );
      }
      await writeAuditLog(
        ctx,
        {
          action: "purchase_order.cancel",
          entityType: "PurchaseOrder",
          entityId: id,
          before: { status: order.status },
          after: { status: "CANCELLED" },
          metadata: { summary: reason },
        },
        tx,
      );
      if (order.requestId) {
        await purchaseRequestRepository.setStatus(
          ctx.companyId,
          order.requestId,
          ["ORDERED"],
          { status: "CANCELLED" },
          ctx.userId,
          tx,
        );
        await writeAuditLog(
          ctx,
          {
            action: "purchase_request.cancel",
            entityType: "PurchaseRequest",
            entityId: order.requestId,
            before: { status: "ORDERED" },
            after: { status: "CANCELLED" },
            metadata: { summary: `Order ${formatRecordNumber("purchaseOrder", order.number)} cancelled` },
          },
          tx,
        );
      }
    });
  },

  /**
   * Records goods received: a GRN with the received lines, one GOODS_RECEIPT stock movement per line (at the order
   * price), and the new order status. Quantities can't exceed what is still open on each line.
   */
  async receive(ctx: TenantContext, id: string, input: GoodsReceiptInput) {
    authorize(ctx, "inventory:create");
    await this.get(ctx, id);
    return db.$transaction(async (tx) => {
      const status = await purchaseOrderRepository.lock(ctx.companyId, id, tx);
      const order = await purchaseOrderRepository.findById(ctx.companyId, id, tx);
      if (!status || !order) throw new NotFoundError("Purchase order");
      if (!RECEIVABLE_ORDER_STATUSES.some((allowed) => allowed === status)) {
        throw new ConflictError("Goods can only be received for placed orders that aren't fully received.");
      }
      const { lines } = withReceived(order);
      const received = input.items.flatMap((item, index) => {
        if (!item.quantity || compareQuantity(item.quantity, "0") === 0) return [];
        const line = lines.find((candidate) => candidate.id === item.orderItemId);
        if (!line)
          throw new ValidationError("Unknown order line.", {
            [`items.${index}.quantity`]: ["Unknown line."],
          });
        const qty = quantity(item.quantity);
        if (compareQuantity(qty, line.remaining) > 0) {
          throw new ValidationError(
            `Only ${trimQuantity(line.remaining)} ${line.product.unit} still to receive.`,
            {
              [`items.${index}.quantity`]: [`At most ${trimQuantity(line.remaining)}.`],
            },
          );
        }
        return [{ line, quantity: qty }];
      });
      if (received.length === 0) {
        throw new ValidationError("Enter the quantity received for at least one line.", {
          items: ["Enter at least one quantity."],
        });
      }
      const number = await numberSequenceRepository.next(ctx.companyId, "goodsReceipt", tx);
      const receipt = await purchaseOrderRepository.createReceipt(
        ctx.companyId,
        number,
        {
          orderId: id,
          warehouseId: order.warehouseId,
          receivedDate: dateOnlyToDate(input.receivedDate),
          note: input.note || null,
        },
        received.map(({ line, quantity: qty }) => ({
          orderItemId: line.id,
          productId: line.productId,
          quantity: qty,
        })),
        ctx.userId,
        tx,
      );
      const code = formatRecordNumber("goodsReceipt", number);
      for (const { line, quantity: qty } of received) {
        const movement = await recordMovement(
          ctx.companyId,
          ctx.userId,
          {
            productId: line.productId,
            warehouseId: order.warehouseId,
            type: "GOODS_RECEIPT",
            quantity: qty,
            unitCost: money(line.unitPrice),
            movementDate: dateOnlyToDate(input.receivedDate),
            reference: code,
            note: input.note || null,
            goodsReceiptId: receipt.id,
          },
          tx,
        );
        await writeAuditLog(
          ctx,
          {
            action: "stock.receipt",
            entityType: "Product",
            entityId: line.productId,
            after: {
              code: formatRecordNumber("stock", movement.number),
              type: movement.type,
              warehouseId: movement.warehouseId,
              quantity: qty,
            },
            metadata: {
              summary: `+${trimQuantity(qty)} ${line.product.unit} in ${order.warehouse.name} (${code})`,
              reference: code,
            },
          },
          tx,
        );
      }
      const after = receiptStatus(
        lines.map((line) => {
          const extra = received.find((item) => item.line.id === line.id)?.quantity ?? "0";
          return { ordered: line.ordered, received: sumQuantities([line.received, extra]) };
        }),
      );
      await purchaseOrderRepository.setStatus(
        ctx.companyId,
        id,
        [status === "ORDERED" ? "ORDERED" : "PARTIALLY_RECEIVED"],
        { status: after },
        ctx.userId,
        tx,
      );
      await writeAuditLog(
        ctx,
        {
          action: "purchase_order.receive",
          entityType: "PurchaseOrder",
          entityId: id,
          before: { status },
          after: {
            status: after,
            receipt: code,
            lines: received.map(({ line, quantity: qty }) => ({ productId: line.productId, quantity: qty })),
          },
          metadata: { summary: code },
        },
        tx,
      );
      return receipt;
    });
  },

  async history(ctx: TenantContext, id: string) {
    await this.get(ctx, id);
    return recordHistory(ctx, "PurchaseOrder", id, {
      actions: HISTORY_ACTIONS,
      fields: {},
      detail: (_action, { metadata }) => snapshotText(metadata, "summary"),
    });
  },

  /** Placed orders a bill can be recorded for (optionally of one supplier). */
  async billable(ctx: TenantContext, supplierId?: string) {
    authorize(ctx, "purchases:view");
    return purchaseOrderRepository.billable(ctx.companyId, supplierId);
  },
};
