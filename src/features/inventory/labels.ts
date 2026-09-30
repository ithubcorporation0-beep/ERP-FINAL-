import type { StatusTone } from "@/components/shared/status-badge";
import type {
  PurchaseOrderStatusKey,
  PurchaseRequestStatusKey,
  StockMovementTypeKey,
  StockStatus,
  SupplierInvoiceStatusKey,
} from "@/config/inventory";

export const STOCK_STATUS_TONES: Record<StockStatus, StatusTone> = {
  out: "danger",
  low: "warning",
  ok: "success",
};

export const MOVEMENT_TYPE_TONES: Record<StockMovementTypeKey, StatusTone> = {
  STOCK_IN: "success",
  GOODS_RECEIPT: "success",
  TRANSFER_IN: "info",
  TRANSFER_OUT: "info",
  STOCK_OUT: "warning",
  ADJUSTMENT: "neutral",
};

export const PURCHASE_REQUEST_TONES: Record<PurchaseRequestStatusKey, StatusTone> = {
  PENDING: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  ORDERED: "success",
  CANCELLED: "neutral",
};

export const PURCHASE_ORDER_TONES: Record<PurchaseOrderStatusKey, StatusTone> = {
  DRAFT: "neutral",
  ORDERED: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CANCELLED: "danger",
};

export const SUPPLIER_INVOICE_TONES: Record<SupplierInvoiceStatusKey, StatusTone> = {
  UNPAID: "warning",
  PARTIALLY_PAID: "info",
  PAID: "success",
  CANCELLED: "neutral",
};
