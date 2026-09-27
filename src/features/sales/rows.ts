import { formatRecordNumber } from "@/config/records";
import {
  INVOICE_STATUS_LABELS,
  invoiceDisplayStatus,
  PAYMENT_METHOD_LABELS,
  QUOTATION_STATUS_LABELS,
  quotationDisplayStatus,
  type InvoiceStatusKey,
  type PaymentMethodKey,
  type QuotationStatusKey,
} from "@/config/sales";
import { dateToDateOnly } from "@/lib/date-range";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { money, subtractMoney } from "@/lib/money";
import { INVOICE_STATUS_TONES, QUOTATION_STATUS_TONES } from "./labels";
import type { PaymentEntry } from "./payments-table";
import type { SalesRow } from "./sales-lists";

/** Server-side mapping from records to preformatted list rows (company locale, exact money). */

interface Format {
  locale: string;
  today: string;
}

type Money = { toString(): string };

export function quotationRow(
  quotation: {
    id: string;
    number: number;
    orderNumber: number | null;
    status: QuotationStatusKey;
    quoteDate: Date;
    expiryDate: Date;
    currency: string;
    total: Money;
    customer: { name: string };
  },
  { locale, today }: Format,
  asOrder = false,
): SalesRow {
  const status = quotationDisplayStatus(quotation.status, dateToDateOnly(quotation.expiryDate), today);
  const quoteCode = formatRecordNumber("quotation", quotation.number);
  const orderCode =
    quotation.orderNumber === null ? null : formatRecordNumber("order", quotation.orderNumber);
  return {
    id: quotation.id,
    href: `/sales/quotations/${quotation.id}`,
    code: asOrder && orderCode ? orderCode : quoteCode,
    reference: asOrder ? quoteCode : orderCode,
    customer: quotation.customer.name,
    date: formatCalendarDate(quotation.quoteDate, { locale }),
    secondary: asOrder ? null : formatCalendarDate(quotation.expiryDate, { locale }),
    secondaryAlert: status === "EXPIRED",
    amount: formatMoney(money(quotation.total), { locale, currency: quotation.currency }) ?? "",
    status: { label: QUOTATION_STATUS_LABELS[status], tone: QUOTATION_STATUS_TONES[status] },
  };
}

export function invoiceRow(
  invoice: {
    id: string;
    code: string;
    status: InvoiceStatusKey;
    invoiceDate: Date;
    dueDate: Date;
    currency: string;
    total: Money;
    amountPaid: Money;
    customer: { name: string };
  },
  { locale, today }: Format,
): SalesRow {
  const status = invoiceDisplayStatus(invoice.status, dateToDateOnly(invoice.dueDate), today);
  const currency = { locale, currency: invoice.currency };
  const balance = subtractMoney(money(invoice.total), money(invoice.amountPaid));
  return {
    id: invoice.id,
    href: `/sales/invoices/${invoice.id}`,
    code: invoice.code,
    customer: invoice.customer.name,
    date: formatCalendarDate(invoice.invoiceDate, { locale }),
    secondary: formatCalendarDate(invoice.dueDate, { locale }),
    secondaryAlert: status === "OVERDUE",
    amount: formatMoney(money(invoice.total), currency) ?? "",
    balance:
      invoice.status === "CANCELLED" || invoice.status === "DRAFT" ? null : formatMoney(balance, currency),
    status: { label: INVOICE_STATUS_LABELS[status], tone: INVOICE_STATUS_TONES[status] },
  };
}

interface PaymentRecord {
  id: string;
  number: number;
  amount: Money;
  method: PaymentMethodKey;
  reference: string | null;
  paymentDate: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  customer: { name: string };
  invoice: { id: string; code: string; currency: string };
  createdBy: { name: string } | null;
  voidedBy: { name: string } | null;
}

export function paymentRow(payment: PaymentRecord, { locale }: Format): SalesRow {
  return {
    id: payment.id,
    href: `/sales/invoices/${payment.invoice.id}`,
    code: formatRecordNumber("payment", payment.number),
    reference: payment.invoice.code,
    customer: payment.customer.name,
    date: formatCalendarDate(payment.paymentDate, { locale }),
    secondary: `${PAYMENT_METHOD_LABELS[payment.method]}${payment.reference ? ` · ${payment.reference}` : ""}`,
    amount: formatMoney(money(payment.amount), { locale, currency: payment.invoice.currency }) ?? "",
    status: payment.voidedAt ? { label: "Voided", tone: "neutral" } : { label: "Received", tone: "success" },
  };
}

export function paymentEntry(payment: PaymentRecord, { locale }: Format): PaymentEntry {
  return {
    id: payment.id,
    code: formatRecordNumber("payment", payment.number),
    date: formatCalendarDate(payment.paymentDate, { locale }),
    method: PAYMENT_METHOD_LABELS[payment.method],
    reference: payment.reference,
    amount: formatMoney(money(payment.amount), { locale, currency: payment.invoice.currency }) ?? "",
    recordedBy: payment.createdBy?.name ?? null,
    voided: payment.voidedAt
      ? { reason: payment.voidReason ?? "", by: payment.voidedBy?.name ?? null }
      : null,
  };
}
