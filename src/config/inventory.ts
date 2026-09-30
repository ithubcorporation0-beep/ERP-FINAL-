/**
 * Inventory and purchasing vocabulary shared by validation, server and UI. Value lists mirror the Prisma enums
 * (checked by tests/unit/inventory.test.ts) but live here so browser code never imports the Prisma client.
 * Rules: docs/inventory.md.
 */

export const STOCK_MOVEMENT_TYPES = [
  "STOCK_IN",
  "STOCK_OUT",
  "ADJUSTMENT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "GOODS_RECEIPT",
] as const;
export type StockMovementTypeKey = (typeof STOCK_MOVEMENT_TYPES)[number];
export const STOCK_MOVEMENT_TYPE_LABELS: Record<StockMovementTypeKey, string> = {
  STOCK_IN: "Stock in",
  STOCK_OUT: "Stock out",
  ADJUSTMENT: "Adjustment",
  TRANSFER_OUT: "Transfer out",
  TRANSFER_IN: "Transfer in",
  GOODS_RECEIPT: "Goods received",
};

/** The stock operations people record by hand (goods receipts come from purchase orders). */
export const STOCK_OPERATIONS = ["IN", "OUT", "ADJUST", "TRANSFER"] as const;
export type StockOperationKey = (typeof STOCK_OPERATIONS)[number];
export const STOCK_OPERATION_LABELS: Record<StockOperationKey, string> = {
  IN: "Stock in",
  OUT: "Stock out",
  ADJUST: "Stock adjustment (count)",
  TRANSFER: "Stock transfer",
};

export const PRODUCT_UNITS = ["pcs", "box", "pack", "kg", "g", "l", "ml", "m", "set", "hour"] as const;

export type StockStatus = "out" | "low" | "ok";
export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  out: "Out of stock",
  low: "Low stock",
  ok: "In stock",
};

export const PURCHASE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "ORDERED", "CANCELLED"] as const;
export type PurchaseRequestStatusKey = (typeof PURCHASE_REQUEST_STATUSES)[number];
export const PURCHASE_REQUEST_STATUS_LABELS: Record<PurchaseRequestStatusKey, string> = {
  PENDING: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ORDERED: "Ordered",
  CANCELLED: "Cancelled",
};

export const PURCHASE_ORDER_STATUSES = [
  "DRAFT",
  "ORDERED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;
export type PurchaseOrderStatusKey = (typeof PURCHASE_ORDER_STATUSES)[number];
export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatusKey, string> = {
  DRAFT: "Draft",
  ORDERED: "Ordered",
  PARTIALLY_RECEIVED: "Partly received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};
/** Orders goods can still be received against. */
export const RECEIVABLE_ORDER_STATUSES: readonly PurchaseOrderStatusKey[] = ["ORDERED", "PARTIALLY_RECEIVED"];

export const SUPPLIER_INVOICE_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type SupplierInvoiceStatusKey = (typeof SUPPLIER_INVOICE_STATUSES)[number];
export const SUPPLIER_INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatusKey, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partly paid",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};
