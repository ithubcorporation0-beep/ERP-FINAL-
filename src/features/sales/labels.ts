import type { StatusTone } from "@/components/shared/status-badge";
import type { InvoiceDisplayStatus, QuotationDisplayStatus } from "@/config/sales";

export const QUOTATION_STATUS_TONES: Record<QuotationDisplayStatus, StatusTone> = {
  DRAFT: "neutral",
  SENT: "info",
  CONFIRMED: "success",
  DECLINED: "danger",
  INVOICED: "success",
  CANCELLED: "neutral",
  EXPIRED: "warning",
};

export const INVOICE_STATUS_TONES: Record<InvoiceDisplayStatus, StatusTone> = {
  DRAFT: "neutral",
  SENT: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  CANCELLED: "neutral",
};
