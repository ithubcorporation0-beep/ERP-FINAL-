import { describe, expect, it } from "vitest";
import {
  PURCHASE_ORDER_STATUSES,
  PURCHASE_REQUEST_STATUSES,
  STOCK_MOVEMENT_TYPES,
  SUPPLIER_INVOICE_STATUSES,
} from "@/config/inventory";
import { formatRecordNumber, parseRecordNumber } from "@/config/records";
import {
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  StockMovementType,
  SupplierInvoiceStatus,
} from "@/generated/prisma/enums";
import {
  adjustmentDelta,
  compareQuantity,
  isLowStock,
  lineAmount,
  quantity,
  receiptStatus,
  remainingToReceive,
  shortfall,
  stockOnHand,
  stockStatus,
  sumQuantities,
  supplierInvoiceStatus,
  trimQuantity,
} from "@/lib/inventory";
import { productSchema, stockOperationSchema, supplierInvoiceSchema } from "@/lib/validation";

const sorted = (values: readonly string[]) => [...values].sort();

describe("inventory vocabulary", () => {
  it("matches the database enums", () => {
    expect(sorted(STOCK_MOVEMENT_TYPES)).toEqual(sorted(Object.values(StockMovementType)));
    expect(sorted(PURCHASE_REQUEST_STATUSES)).toEqual(sorted(Object.values(PurchaseRequestStatus)));
    expect(sorted(PURCHASE_ORDER_STATUSES)).toEqual(sorted(Object.values(PurchaseOrderStatus)));
    expect(sorted(SUPPLIER_INVOICE_STATUSES)).toEqual(sorted(Object.values(SupplierInvoiceStatus)));
  });

  it("formats and parses the new record numbers", () => {
    expect(formatRecordNumber("product", 4)).toBe("PRD-0004");
    expect(formatRecordNumber("purchaseOrder", 12)).toBe("PO-0012");
    expect(formatRecordNumber("supplierInvoice", 1)).toBe("BILL-0001");
    expect(parseRecordNumber("purchaseRequest", "pr-7")).toBe(7);
    expect(parseRecordNumber("stock", "STK-0031")).toBe(31);
  });
});

describe("stock calculations", () => {
  it("stock on hand is the exact sum of signed movements", () => {
    expect(stockOnHand([])).toBe("0.000");
    expect(
      stockOnHand([{ quantity: "10" }, { quantity: "-2.5" }, { quantity: "0.1" }, { quantity: "0.2" }]),
    ).toBe("7.800");
    // No floating point drift: 0.1 + 0.2 is exactly 0.3.
    expect(sumQuantities(["0.1", "0.2"])).toBe("0.300");
    // Prisma decimals print without trailing zeros; normalisation handles both.
    expect(quantity("12.5")).toBe("12.500");
    expect(trimQuantity("12.500")).toBe("12.5");
    expect(trimQuantity("3.000")).toBe("3");
  });

  it("adjustments record counted − on hand", () => {
    expect(adjustmentDelta("15", "12")).toBe("-3.000");
    expect(adjustmentDelta("0", "4.25")).toBe("4.250");
    expect(adjustmentDelta("7", "7.000")).toBeNull();
  });

  it("classifies stock and detects low stock only when a minimum is set", () => {
    expect(stockStatus("0", "0")).toBe("out");
    expect(stockStatus("5", "0")).toBe("ok");
    expect(stockStatus("5", "5")).toBe("low");
    expect(stockStatus("5.001", "5")).toBe("ok");
    expect(isLowStock("0", "0")).toBe(false);
    expect(isLowStock("0", "10")).toBe(true);
    expect(isLowStock("10", "10")).toBe(true);
    expect(isLowStock("10.5", "10")).toBe(false);
    expect(shortfall("4", "10")).toBe("6.000");
    expect(shortfall("12", "10")).toBe("0.000");
  });

  it("values lines exactly (quantity × price, rounded half away from zero to cents)", () => {
    expect(lineAmount("40", "2.40")).toBe("96.00");
    expect(lineAmount("20.5", "2.50")).toBe("51.25");
    expect(lineAmount("0.333", "0.10")).toBe("0.03");
    expect(lineAmount("1.005", "1.00")).toBe("1.01");
  });

  it("tracks what is still to receive and the resulting order status", () => {
    expect(remainingToReceive("40", "25")).toBe("15.000");
    expect(remainingToReceive("40", "40")).toBe("0.000");
    expect(compareQuantity(remainingToReceive("40", "41"), "0")).toBe(0);
    expect(receiptStatus([{ ordered: "40", received: "0" }])).toBe("ORDERED");
    expect(
      receiptStatus([
        { ordered: "40", received: "25" },
        { ordered: "5", received: "0" },
      ]),
    ).toBe("PARTIALLY_RECEIVED");
    expect(
      receiptStatus([
        { ordered: "40", received: "40" },
        { ordered: "5", received: "5" },
      ]),
    ).toBe("RECEIVED");
  });

  it("derives the bill status from what was paid", () => {
    expect(supplierInvoiceStatus("110.40", "0.00")).toBe("UNPAID");
    expect(supplierInvoiceStatus("110.40", "50.00")).toBe("PARTIALLY_PAID");
    expect(supplierInvoiceStatus("110.40", "110.40")).toBe("PAID");
  });
});

describe("inventory validation", () => {
  const operation = (input: Record<string, unknown>) =>
    stockOperationSchema.safeParse({
      operation: "IN",
      productId: "0199a8f4-6b2e-7c3d-8e4f-5a6b7c8d9e0f",
      warehouseId: "0199a8f4-6b2e-7c3d-8e4f-5a6b7c8d9e10",
      quantity: "5",
      movementDate: "2026-10-01",
      ...input,
    }).success;

  it("validates stock operations", () => {
    expect(operation({})).toBe(true);
    expect(operation({ quantity: "0" })).toBe(false);
    expect(operation({ quantity: "-1" })).toBe(false);
    expect(operation({ quantity: "1.2345" })).toBe(false);
    // Adjustments may count zero but need a reason.
    expect(operation({ operation: "ADJUST", quantity: "0" })).toBe(false);
    expect(operation({ operation: "ADJUST", quantity: "0", note: "Damaged in flood" })).toBe(true);
    // Transfers need a different target warehouse.
    expect(operation({ operation: "TRANSFER" })).toBe(false);
    expect(operation({ operation: "TRANSFER", toWarehouseId: "0199a8f4-6b2e-7c3d-8e4f-5a6b7c8d9e10" })).toBe(
      false,
    );
    expect(operation({ operation: "TRANSFER", toWarehouseId: "0199a8f4-6b2e-7c3d-8e4f-5a6b7c8d9e11" })).toBe(
      true,
    );
  });

  it("validates products and supplier invoices", () => {
    const product = (input: Record<string, unknown>) =>
      productSchema.safeParse({
        sku: "ABC-1",
        name: "Cable",
        unit: "pcs",
        purchasePrice: "1.00",
        sellingPrice: "2.00",
        minimumStock: "0",
        ...input,
      }).success;
    expect(product({})).toBe(true);
    expect(product({ sku: "has space" })).toBe(false);
    expect(product({ purchasePrice: "-1" })).toBe(false);
    expect(product({ minimumStock: "2.5" })).toBe(true);
    // No stock field: a product form can't set stock.
    expect(
      productSchema.parse({
        sku: "A",
        name: "Cable",
        unit: "pcs",
        purchasePrice: "1",
        sellingPrice: "1",
        minimumStock: "0",
        onHand: "99",
      }),
    ).not.toHaveProperty("onHand");

    const bill = (input: Record<string, unknown>) =>
      supplierInvoiceSchema.safeParse({
        supplierId: "0199a8f4-6b2e-7c3d-8e4f-5a6b7c8d9e0f",
        invoiceDate: "2026-10-01",
        subtotal: "100",
        taxAmount: "0",
        ...input,
      }).success;
    expect(bill({})).toBe(true);
    expect(bill({ subtotal: "0" })).toBe(false);
    expect(bill({ dueDate: "2026-09-30" })).toBe(false);
  });
});
