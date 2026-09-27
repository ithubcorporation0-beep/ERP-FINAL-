/**
 * Sales vocabulary shared by validation, server and UI. The value lists mirror the Prisma enums (checked by
 * tests/unit/sales.test.ts) but live here so browser code never imports the Prisma client.
 */

export const QUOTATION_STATUSES = [
  "DRAFT",
  "SENT",
  "CONFIRMED",
  "DECLINED",
  "INVOICED",
  "CANCELLED",
] as const;
export type QuotationStatusKey = (typeof QUOTATION_STATUSES)[number];

/** What people see: stored statuses plus "EXPIRED" (draft/sent past its expiry date — derived, never stored). */
export const QUOTATION_DISPLAY_STATUSES = [...QUOTATION_STATUSES, "EXPIRED"] as const;
export type QuotationDisplayStatus = (typeof QUOTATION_DISPLAY_STATUSES)[number];
export const QUOTATION_STATUS_LABELS: Record<QuotationDisplayStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  CONFIRMED: "Confirmed (sales order)",
  DECLINED: "Declined",
  INVOICED: "Invoiced",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

/** Statuses in which a quotation can still be edited, sent, confirmed or converted. */
export const OPEN_QUOTATION_STATUSES: readonly QuotationStatusKey[] = ["DRAFT", "SENT"];

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type InvoiceStatusKey = (typeof INVOICE_STATUSES)[number];

/** Stored statuses plus "OVERDUE" (sent / partially paid, past the due date, balance left — derived). */
export const INVOICE_DISPLAY_STATUSES = [
  "DRAFT",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;
export type InvoiceDisplayStatus = (typeof INVOICE_DISPLAY_STATUSES)[number];
export const INVOICE_STATUS_LABELS: Record<InvoiceDisplayStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

/** Invoices that still expect money. */
export const OPEN_INVOICE_STATUSES: readonly InvoiceStatusKey[] = ["SENT", "PARTIALLY_PAID"];

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "ONLINE", "OTHER"] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKey, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  ONLINE: "Online payment",
  OTHER: "Other",
};

/** Maximum lines on one quotation or invoice. */
export const MAX_DOCUMENT_LINES = 200;

/** Largest amount a NUMERIC(18,2) column holds. */
export const MAX_MONEY = "9999999999999999.99";

/** How long a shared document link (WhatsApp etc.) works. */
export const SHARE_LINK_DAYS = 30;

/** A calendar date ("YYYY-MM-DD") is before `today` (also "YYYY-MM-DD"). Plain string comparison is exact. */
export function isBefore(date: string, today: string): boolean {
  return date < today;
}

export function quotationDisplayStatus(status: QuotationStatusKey, expiryDate: string, today: string) {
  return OPEN_QUOTATION_STATUSES.includes(status) && isBefore(expiryDate, today) ? "EXPIRED" : status;
}

export function invoiceDisplayStatus(
  status: InvoiceStatusKey,
  dueDate: string,
  today: string,
): InvoiceDisplayStatus {
  return OPEN_INVOICE_STATUSES.includes(status) && isBefore(dueDate, today) ? "OVERDUE" : status;
}
