import { describe, expect, it } from "vitest";
import { todayInZone } from "@/lib/date-range";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant";
import {
  goodsReceiptSchema,
  productListQuerySchema,
  productSchema,
  purchaseOrderSchema,
  purchaseRequestSchema,
  stockMovementListQuerySchema,
  stockOperationSchema,
  supplierInvoiceSchema,
  supplierPaymentSchema,
  supplierSchema,
  warehouseSchema,
} from "@/lib/validation";
import { accountingService } from "@/server/services/accounting.service";
import { dashboardService } from "@/server/services/dashboard.service";
import { financialReportService } from "@/server/services/financial-report.service";
import { productService } from "@/server/services/product.service";
import { purchaseOrderService } from "@/server/services/purchase-order.service";
import { purchaseRequestService } from "@/server/services/purchase-request.service";
import { stockService } from "@/server/services/stock.service";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";
import { supplierService } from "@/server/services/supplier.service";
import { warehouseService } from "@/server/services/warehouse.service";
import { addMember, createCompanyWithOwner } from "./helpers";
import { rawDb } from "./raw-db";

const today = () => todayInZone("UTC");

async function setup(name: string) {
  const owner = await createCompanyWithOwner(name);
  const main = await warehouseService.create(owner, warehouseSchema.parse({ name: "Main" }));
  const shop = await warehouseService.create(owner, warehouseSchema.parse({ name: "Shop" }));
  const supplier = await supplierService.create(owner, supplierSchema.parse({ name: "Acme Supplies" }));
  const product = await productService.create(
    owner,
    productSchema.parse({
      sku: "CBL-USB-C",
      name: "USB-C cable",
      unit: "pcs",
      purchasePrice: "2.50",
      sellingPrice: "6.00",
      minimumStock: "10",
      supplierId: supplier.id,
      warehouseId: main.id,
    }),
  );
  return { owner, main, shop, supplier, product };
}

function op(ctx: TenantContext, input: Record<string, unknown>) {
  return stockService.record(ctx, stockOperationSchema.parse({ movementDate: today(), ...input }));
}

async function onHand(ctx: TenantContext, productId: string) {
  return (await productService.detail(ctx, productId)).stock.onHand;
}

describe("stock calculations", () => {
  it("derives stock from movements: in, out, adjustment, transfer — never negative", async () => {
    const { owner, main, shop, product } = await setup("Stock Co");
    expect(await onHand(owner, product.id)).toBe("0.000");

    await op(owner, { operation: "IN", productId: product.id, warehouseId: main.id, quantity: "25" });
    await op(owner, { operation: "OUT", productId: product.id, warehouseId: main.id, quantity: "4.5" });
    expect(await onHand(owner, product.id)).toBe("20.500");

    // Can't take out more than is in that warehouse.
    await expect(
      op(owner, { operation: "OUT", productId: product.id, warehouseId: main.id, quantity: "21" }),
    ).rejects.toBeInstanceOf(ValidationError);

    // Transfer: two movements, total unchanged, per-warehouse stock moves.
    const transfer = await op(owner, {
      operation: "TRANSFER",
      productId: product.id,
      warehouseId: main.id,
      toWarehouseId: shop.id,
      quantity: "5.5",
    });
    expect(transfer.map((movement) => [movement.type, movement.quantity.toString()])).toEqual([
      ["TRANSFER_OUT", "-5.5"],
      ["TRANSFER_IN", "5.5"],
    ]);
    const detail = await productService.detail(owner, product.id);
    expect(detail.stock.onHand).toBe("20.500");
    expect(detail.warehouses.map((row) => [row.name, row.onHand])).toEqual([
      ["Main", "15.000"],
      ["Shop", "5.500"],
    ]);

    // Adjustment to a counted quantity records the difference.
    const [adjustment] = await op(owner, {
      operation: "ADJUST",
      productId: product.id,
      warehouseId: main.id,
      quantity: "12",
      note: "Stock count",
    });
    expect(adjustment?.quantity.toString()).toBe("-3");
    await expect(
      op(owner, {
        operation: "ADJUST",
        productId: product.id,
        warehouseId: main.id,
        quantity: "12",
        note: "Again",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await onHand(owner, product.id)).toBe("17.500");
    expect(detail.value).toBe("51.25"); // 20.5 × 2.50 before the adjustment

    // History lists every movement, newest first; the product history shows the operations.
    const history = await stockService.list(
      owner,
      stockMovementListQuerySchema.parse({ productId: product.id }),
    );
    expect(history.total).toBe(5);
    const productHistory = await productService.history(owner, product.id);
    expect(productHistory.map((entry) => entry.label).slice(0, 4)).toEqual([
      "Stock adjusted",
      "Stock transferred",
      "Stock out",
      "Stock in",
    ]);

    // The database refuses changing or deleting a movement, and negative stock even from raw SQL.
    await expect(
      rawDb.stockMovement.update({ where: { id: adjustment?.id ?? "" }, data: { note: "changed" } }),
    ).rejects.toThrow(/cannot be changed/);
    await expect(rawDb.stockMovement.delete({ where: { id: adjustment?.id ?? "" } })).rejects.toThrow(
      /cannot be changed/,
    );
    await expect(
      rawDb.stockMovement.create({
        data: {
          companyId: owner.companyId,
          number: 999,
          productId: product.id,
          warehouseId: shop.id,
          type: "STOCK_OUT",
          quantity: "-6",
          movementDate: new Date(),
        },
      }),
    ).rejects.toThrow(/Not enough stock/);
    expect(await onHand(owner, product.id)).toBe("17.500");

    // A product with stock can't be deleted.
    await expect(productService.remove(owner, product.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("detects low stock and keeps two simultaneous stock-outs from overselling", async () => {
    const { owner, main, product } = await setup("Low Stock Co");
    // No movements yet: 0 ≤ minimum 10 → low (and out of stock).
    expect((await productService.lowStock(owner)).map((row) => row.id)).toEqual([product.id]);
    await op(owner, { operation: "IN", productId: product.id, warehouseId: main.id, quantity: "12" });
    expect(await productService.lowStock(owner)).toEqual([]);
    const low = await productService.list(owner, productListQuerySchema.parse({ stock: "low" }));
    expect(low.total).toBe(0);

    const results = await Promise.allSettled([
      op(owner, { operation: "OUT", productId: product.id, warehouseId: main.id, quantity: "8" }),
      op(owner, { operation: "OUT", productId: product.id, warehouseId: main.id, quantity: "8" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await onHand(owner, product.id)).toBe("4.000");

    const lowNow = await productService.list(owner, productListQuerySchema.parse({ stock: "low" }));
    expect(lowNow.items.map((row) => [row.id, row.stock.status, row.stock.shortfall])).toEqual([
      [product.id, "low", "6.000"],
    ]);
    const kpis = await dashboardService.kpis(await dashboardService.scope(owner, "this-month"));
    expect(kpis.find((kpi) => kpi.id === "lowStockItems")?.state).toMatchObject({ data: { value: "1" } });
  });
});

describe("purchasing workflow", () => {
  it("runs request → order → goods received → supplier invoice → payment, with stock and ledger", async () => {
    const { owner, main, supplier, product } = await setup("Purchasing Co");
    const { ctx: storekeeper } = await addMember(owner, "Inventory Manager");
    const { ctx: manager } = await addMember(owner, "Manager");
    const { ctx: accountant } = await addMember(owner, "Accountant");

    // 1. Purchase request by the storekeeper; nobody decides their own request.
    const request = await purchaseRequestService.create(
      storekeeper,
      purchaseRequestSchema.parse({
        supplierId: supplier.id,
        reason: "Restock cables",
        items: [{ productId: product.id, quantity: "40", estimatedUnitPrice: "2.50" }],
      }),
    );
    expect(request).toMatchObject({ number: 1, status: "PENDING" });
    await expect(
      purchaseRequestService.decide(storekeeper, request.id, { decision: "approve" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Even the owner, who may approve, can't approve their own request.
    const ownerRequest = await purchaseRequestService.create(
      owner,
      purchaseRequestSchema.parse({ reason: "Mine", items: [{ productId: product.id, quantity: "1" }] }),
    );
    await expect(
      purchaseRequestService.decide(owner, ownerRequest.id, { decision: "approve" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await purchaseRequestService.decide(manager, request.id, { decision: "approve" });

    // 2. Purchase order from the approved request; the request becomes Ordered, a second order is refused.
    const orderInput = purchaseOrderSchema.parse({
      supplierId: supplier.id,
      warehouseId: main.id,
      requestId: request.id,
      orderDate: today(),
      items: [{ productId: product.id, quantity: "40", unitPrice: "2.40" }],
    });
    const order = await purchaseOrderService.create(storekeeper, orderInput);
    expect(order).toMatchObject({ number: 1, status: "DRAFT" });
    expect(order.total.toString()).toBe("96");
    expect((await purchaseRequestService.get(owner, request.id)).status).toBe("ORDERED");
    await expect(purchaseOrderService.create(storekeeper, orderInput)).rejects.toBeInstanceOf(
      ValidationError,
    );

    // Draft orders can't receive goods; placing the order opens receiving.
    const line = (await purchaseOrderService.detail(owner, order.id)).lines[0];
    if (!line) throw new Error("order line missing");
    const receiveAll = goodsReceiptSchema.parse({
      receivedDate: today(),
      items: [{ orderItemId: line.id, quantity: "1" }],
    });
    await expect(purchaseOrderService.receive(storekeeper, order.id, receiveAll)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await purchaseOrderService.placeOrder(storekeeper, order.id);

    // 3. Goods received in two parts; over-receiving is refused.
    await expect(
      purchaseOrderService.receive(
        storekeeper,
        order.id,
        goodsReceiptSchema.parse({
          receivedDate: today(),
          items: [{ orderItemId: line.id, quantity: "41" }],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await purchaseOrderService.receive(
      storekeeper,
      order.id,
      goodsReceiptSchema.parse({ receivedDate: today(), items: [{ orderItemId: line.id, quantity: "25" }] }),
    );
    expect((await purchaseOrderService.get(owner, order.id)).status).toBe("PARTIALLY_RECEIVED");
    expect(await onHand(owner, product.id)).toBe("25.000");
    await purchaseOrderService.receive(
      storekeeper,
      order.id,
      goodsReceiptSchema.parse({ receivedDate: today(), items: [{ orderItemId: line.id, quantity: "15" }] }),
    );
    const received = await purchaseOrderService.detail(owner, order.id);
    expect(received.status).toBe("RECEIVED");
    expect(received.lines[0]).toMatchObject({ received: "40.000", remaining: "0.000" });
    expect(await onHand(owner, product.id)).toBe("40.000");
    const movements = await stockService.list(
      owner,
      stockMovementListQuerySchema.parse({ type: "GOODS_RECEIPT" }),
    );
    expect(movements.items.map((movement) => movement.unitCost?.toString())).toEqual(["2.4", "2.4"]);
    // Received orders can't be cancelled.
    await expect(purchaseOrderService.cancel(owner, order.id, "Changed mind")).rejects.toBeInstanceOf(
      ConflictError,
    );

    // 4. Supplier invoice: only people who may post to the ledger; can't bill more than the order.
    await expect(
      supplierInvoiceService.create(
        storekeeper,
        supplierInvoiceSchema.parse({
          supplierId: supplier.id,
          invoiceDate: today(),
          subtotal: "96",
          taxAmount: "0",
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      supplierInvoiceService.create(
        accountant,
        supplierInvoiceSchema.parse({
          supplierId: supplier.id,
          orderId: order.id,
          invoiceDate: today(),
          subtotal: "96.01",
          taxAmount: "0",
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const bill = await supplierInvoiceService.create(
      accountant,
      supplierInvoiceSchema.parse({
        supplierId: supplier.id,
        orderId: order.id,
        supplierReference: "ACME-778",
        invoiceDate: today(),
        subtotal: "96.00",
        taxAmount: "14.40",
      }),
    );
    expect(bill).toMatchObject({ status: "UNPAID" });
    expect(bill.total.toString()).toBe("110.4");

    // 5. Payments: partial, over-payment refused, void reopens, then paid in full.
    const pay = (amount: string) =>
      supplierInvoiceService.pay(
        accountant,
        supplierPaymentSchema.parse({
          invoiceId: bill.id,
          amount,
          method: "BANK_TRANSFER",
          paymentDate: today(),
        }),
      );
    const first = await pay("50");
    expect((await supplierInvoiceService.get(owner, bill.id)).status).toBe("PARTIALLY_PAID");
    await expect(pay("60.41")).rejects.toBeInstanceOf(ValidationError);
    await supplierInvoiceService.voidPayment(accountant, first.id, "Wrong account");
    expect((await supplierInvoiceService.get(owner, bill.id)).status).toBe("UNPAID");
    await expect(supplierInvoiceService.voidPayment(accountant, first.id, "Again")).rejects.toBeInstanceOf(
      ConflictError,
    );
    await pay("110.40");
    const paid = await supplierInvoiceService.get(owner, bill.id);
    expect(paid).toMatchObject({ status: "PAID" });
    expect(paid.amountPaid.toString()).toBe("110.4");
    await expect(supplierInvoiceService.cancel(accountant, bill.id, "Nope")).rejects.toBeInstanceOf(
      ConflictError,
    );

    // Ledger: B1 110.40 purchases / AP; payments net 110.40 out of the bank; AP back to zero and reconciled.
    const accounts = await accountingService.accounts(owner);
    const balance = (key: string) => accounts.find((account) => account.systemKey === key)?.balance;
    expect(balance("purchases")).toBe("110.40");
    expect(balance("payable")).toBe("0.00");
    expect(balance("bank")).toBe("-110.40");
    const payables = await financialReportService.payables(owner);
    expect(payables).toMatchObject({ total: "0.00", reconciled: true });

    // Supplier page relations.
    const related = await supplierService.related(owner, supplier.id);
    expect(related.orders?.map((row) => row.id)).toEqual([order.id]);
    expect(related.invoices?.map((row) => row.id)).toEqual([bill.id]);
    expect(related.payments).toHaveLength(2);
    expect(related.products?.map((row) => [row.id, row.stock.onHand])).toEqual([[product.id, "40.000"]]);
  });

  it("keeps an open bill on Accounts Payable until paid, and cancels an unpaid one with a reversal", async () => {
    const { owner, supplier } = await setup("Bills Co");
    const bill = await supplierInvoiceService.create(
      owner,
      supplierInvoiceSchema.parse({
        supplierId: supplier.id,
        invoiceDate: today(),
        subtotal: "300",
        taxAmount: "0",
      }),
    );
    const open = await financialReportService.payables(owner);
    expect(open).toMatchObject({ total: "300.00", ledgerBalance: "300.00", reconciled: true });
    await supplierInvoiceService.cancel(owner, bill.id, "Duplicate bill");
    const after = await financialReportService.payables(owner);
    expect(after).toMatchObject({ total: "0.00", ledgerBalance: "0.00", reconciled: true });
    await expect(
      rawDb.supplierInvoice.update({ where: { id: bill.id }, data: { total: "1" } }),
    ).rejects.toThrow(/supplier_invoices_total_adds_up/);
  });

  it("cancels an order that nothing was received for, and its request with it", async () => {
    const { owner, main, supplier, product } = await setup("Cancel Co");
    const { ctx: manager } = await addMember(owner, "Manager");
    const request = await purchaseRequestService.create(
      owner,
      purchaseRequestSchema.parse({ reason: "Test", items: [{ productId: product.id, quantity: "5" }] }),
    );
    await purchaseRequestService.decide(manager, request.id, { decision: "approve" });
    const order = await purchaseOrderService.create(
      owner,
      purchaseOrderSchema.parse({
        supplierId: supplier.id,
        warehouseId: main.id,
        requestId: request.id,
        orderDate: today(),
        items: [{ productId: product.id, quantity: "5", unitPrice: "1" }],
      }),
    );
    await purchaseOrderService.cancel(owner, order.id, "Supplier out of stock");
    expect((await purchaseOrderService.get(owner, order.id)).status).toBe("CANCELLED");
    expect((await purchaseRequestService.get(owner, request.id)).status).toBe("CANCELLED");
    const history = await purchaseRequestService.history(owner, request.id);
    expect(history.map((entry) => entry.label)).toEqual(["Cancelled", "Ordered", "Approved", "Requested"]);
  });
});

describe("inventory permissions and isolation", () => {
  it("limits roles and never shows or changes another company's inventory or purchasing", async () => {
    const a = await setup("Inventory A");
    const b = await setup("Inventory B");
    const { ctx: employee } = await addMember(a.owner, "Employee");
    await expect(productService.list(employee, productListQuerySchema.parse({}))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      op(employee, { operation: "IN", productId: a.product.id, warehouseId: a.main.id, quantity: "1" }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await op(a.owner, { operation: "IN", productId: a.product.id, warehouseId: a.main.id, quantity: "3" });
    // B can't see A's product, move A's stock, use A's warehouse, or buy from A's supplier.
    await expect(productService.get(b.owner, a.product.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      op(b.owner, { operation: "OUT", productId: a.product.id, warehouseId: a.main.id, quantity: "1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      op(b.owner, { operation: "IN", productId: b.product.id, warehouseId: a.main.id, quantity: "1" }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(supplierService.get(b.owner, a.supplier.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      purchaseOrderService.create(
        b.owner,
        purchaseOrderSchema.parse({
          supplierId: a.supplier.id,
          warehouseId: b.main.id,
          orderDate: today(),
          items: [{ productId: b.product.id, quantity: "1", unitPrice: "1" }],
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    const history = await stockService.list(b.owner, stockMovementListQuerySchema.parse({}));
    expect(history.total).toBe(0);
    expect(await onHand(a.owner, a.product.id)).toBe("3.000");
    expect(await onHand(b.owner, b.product.id)).toBe("0.000");
    // The same SKU is fine in another company, not twice in one.
    await expect(
      productService.create(
        a.owner,
        productSchema.parse({
          sku: "cbl-usb-c",
          name: "Duplicate",
          unit: "pcs",
          purchasePrice: "1",
          sellingPrice: "1",
          minimumStock: "0",
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
