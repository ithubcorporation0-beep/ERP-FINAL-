import {
  PURCHASE_ORDER_STATUS_LABELS,
  PURCHASE_REQUEST_STATUS_LABELS,
  STOCK_MOVEMENT_TYPE_LABELS,
  SUPPLIER_INVOICE_STATUS_LABELS,
  type PurchaseOrderStatusKey,
  type PurchaseRequestStatusKey,
  type StockMovementTypeKey,
  type StockStatus,
  type SupplierInvoiceStatusKey,
} from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { PAYMENT_METHOD_LABELS, type PaymentMethodKey } from "@/config/sales";
import type { SalesRow } from "@/features/sales/sales-lists";
import { dateToDateOnly } from "@/lib/date-range";
import { formatCalendarDate, formatMoney, type CompanyFormat } from "@/lib/format";
import { compareQuantity, quantity, trimQuantity } from "@/lib/inventory";
import { money, subtractMoney } from "@/lib/money";
import {
  MOVEMENT_TYPE_TONES,
  PURCHASE_ORDER_TONES,
  PURCHASE_REQUEST_TONES,
  SUPPLIER_INVOICE_TONES,
} from "./labels";

/** Server-side mapping from inventory and purchasing records to preformatted, serializable rows. */

type Decimal = { toString(): string };

/** "12.5 pcs". */
export function quantityLabel(value: Decimal | string, unit: string): string {
  return `${trimQuantity(quantity(value.toString()))} ${unit}`;
}

export interface ProductRow {
  id: string;
  code: string;
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  unit: string;
  onHand: string;
  minimum: string;
  status: StockStatus;
  shortfall: string | null;
  purchasePrice: string;
  sellingPrice: string;
  supplier: string | null;
  isActive: boolean;
}

export function toProductRow(
  product: {
    id: string;
    number: number;
    sku: string;
    name: string;
    brand: string | null;
    unit: string;
    purchasePrice: Decimal;
    sellingPrice: Decimal;
    minimumStock: Decimal;
    isActive: boolean;
    category: { name: string } | null;
    supplier: { name: string } | null;
    stock: { onHand: string; status: StockStatus; shortfall: string };
  },
  format: Pick<CompanyFormat, "locale" | "currency">,
): ProductRow {
  return {
    id: product.id,
    code: formatRecordNumber("product", product.number),
    sku: product.sku,
    name: product.name,
    category: product.category?.name ?? null,
    brand: product.brand,
    unit: product.unit,
    onHand: trimQuantity(product.stock.onHand),
    minimum: trimQuantity(quantity(product.minimumStock)),
    status: product.stock.status,
    shortfall:
      compareQuantity(product.stock.shortfall, "0") > 0 ? trimQuantity(product.stock.shortfall) : null,
    purchasePrice: formatMoney(money(product.purchasePrice), format) ?? "",
    sellingPrice: formatMoney(money(product.sellingPrice), format) ?? "",
    supplier: product.supplier?.name ?? null,
    isActive: product.isActive,
  };
}

export function movementRow(
  movement: {
    id: string;
    number: number;
    type: StockMovementTypeKey;
    quantity: Decimal;
    movementDate: Date;
    reference: string | null;
    product: { id: string; name: string; sku: string; unit: string };
    warehouse: { name: string };
  },
  { locale }: { locale: string },
): SalesRow {
  const qty = quantity(movement.quantity);
  return {
    id: movement.id,
    href: `/inventory/products/${movement.product.id}`,
    code: formatRecordNumber("stock", movement.number),
    reference: movement.reference,
    customer: `${movement.product.name} (${movement.product.sku})`,
    date: formatCalendarDate(movement.movementDate, { locale }),
    secondary: movement.warehouse.name,
    amount: `${compareQuantity(qty, "0") > 0 ? "+" : ""}${quantityLabel(qty, movement.product.unit)}`,
    status: { label: STOCK_MOVEMENT_TYPE_LABELS[movement.type], tone: MOVEMENT_TYPE_TONES[movement.type] },
  };
}

export function requestRow(
  request: {
    id: string;
    number: number;
    status: PurchaseRequestStatusKey;
    reason: string;
    neededBy: Date | null;
    createdAt: Date;
    requestedBy: { name: string } | null;
    _count: { items: number };
  },
  format: Pick<CompanyFormat, "locale" | "timeZone">,
): SalesRow {
  return {
    id: request.id,
    href: `/purchasing/requests/${request.id}`,
    code: formatRecordNumber("purchaseRequest", request.number),
    reference: request.requestedBy?.name ?? null,
    customer: request.reason,
    date: new Intl.DateTimeFormat(format.locale, { dateStyle: "medium", timeZone: format.timeZone }).format(
      request.createdAt,
    ),
    secondary: request.neededBy ? formatCalendarDate(request.neededBy, format) : null,
    amount: `${request._count.items} ${request._count.items === 1 ? "product" : "products"}`,
    status: {
      label: PURCHASE_REQUEST_STATUS_LABELS[request.status],
      tone: PURCHASE_REQUEST_TONES[request.status],
    },
  };
}

export function orderRow(
  order: {
    id: string;
    number: number;
    status: PurchaseOrderStatusKey;
    orderDate: Date;
    expectedDate: Date | null;
    total: Decimal;
    currency: string;
    supplier: { name: string };
    warehouse: { name: string };
  },
  { locale, today }: { locale: string; today: string },
): SalesRow {
  const late =
    order.expectedDate !== null &&
    (order.status === "ORDERED" || order.status === "PARTIALLY_RECEIVED") &&
    dateToDateOnly(order.expectedDate) < today;
  return {
    id: order.id,
    href: `/purchasing/orders/${order.id}`,
    code: formatRecordNumber("purchaseOrder", order.number),
    reference: order.warehouse.name,
    customer: order.supplier.name,
    date: formatCalendarDate(order.orderDate, { locale }),
    secondary: order.expectedDate
      ? `${formatCalendarDate(order.expectedDate, { locale })}${late ? " (late)" : ""}`
      : null,
    secondaryAlert: late,
    amount: formatMoney(money(order.total), { locale, currency: order.currency }) ?? "",
    status: { label: PURCHASE_ORDER_STATUS_LABELS[order.status], tone: PURCHASE_ORDER_TONES[order.status] },
  };
}

export function billRow(
  bill: {
    id: string;
    number: number;
    supplierReference: string | null;
    invoiceDate: Date;
    dueDate: Date | null;
    total: Decimal;
    amountPaid: Decimal;
    currency: string;
    status: SupplierInvoiceStatusKey;
    supplier: { name: string };
  },
  { locale, today }: { locale: string; today: string },
): SalesRow {
  const open = bill.status === "UNPAID" || bill.status === "PARTIALLY_PAID";
  const overdue = open && bill.dueDate !== null && dateToDateOnly(bill.dueDate) < today;
  const show = (value: string) => formatMoney(value, { locale, currency: bill.currency }) ?? value;
  return {
    id: bill.id,
    href: `/purchasing/bills/${bill.id}`,
    code: formatRecordNumber("supplierInvoice", bill.number),
    reference: bill.supplierReference,
    customer: bill.supplier.name,
    date: formatCalendarDate(bill.invoiceDate, { locale }),
    secondary: bill.dueDate
      ? `${formatCalendarDate(bill.dueDate, { locale })}${overdue ? " (overdue)" : ""}`
      : null,
    secondaryAlert: overdue,
    amount: show(money(bill.total)),
    balance:
      bill.status === "CANCELLED" ? null : show(subtractMoney(money(bill.total), money(bill.amountPaid))),
    status: { label: SUPPLIER_INVOICE_STATUS_LABELS[bill.status], tone: SUPPLIER_INVOICE_TONES[bill.status] },
  };
}

export function supplierPaymentRow(
  payment: {
    id: string;
    number: number;
    amount: Decimal;
    method: PaymentMethodKey;
    paymentDate: Date;
    voidedAt: Date | null;
    supplier: { name: string };
    invoice: { id: string; number: number };
  },
  { locale, currency }: { locale: string; currency: string },
): SalesRow {
  return {
    id: payment.id,
    href: `/purchasing/bills/${payment.invoice.id}`,
    code: formatRecordNumber("supplierPayment", payment.number),
    reference: formatRecordNumber("supplierInvoice", payment.invoice.number),
    customer: payment.supplier.name,
    date: formatCalendarDate(payment.paymentDate, { locale }),
    secondary: PAYMENT_METHOD_LABELS[payment.method],
    amount: formatMoney(money(payment.amount), { locale, currency }) ?? "",
    status: payment.voidedAt ? { label: "Voided", tone: "danger" } : { label: "Paid", tone: "success" },
  };
}
