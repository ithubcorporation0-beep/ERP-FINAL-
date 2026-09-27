import type { LineAmounts, LineInput } from "@/lib/money";

/** One priced line as stored (all decimals as exact strings). */
export type PricedItem = LineInput &
  LineAmounts & {
    position: number;
    description: string;
  };

/** Columns selected for line items of quotations and invoices. */
export const itemSelect = {
  id: true,
  position: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountPercent: true,
  taxRate: true,
  lineSubtotal: true,
  discountAmount: true,
  taxAmount: true,
  lineTotal: true,
} as const;

/** Customer fields shown on sales documents (addresses for the PDF, phone for WhatsApp). */
export const documentCustomerSelect = {
  id: true,
  number: true,
  name: true,
  companyName: true,
  email: true,
  phone: true,
  whatsapp: true,
  address: true,
  city: true,
  country: true,
  taxId: true,
  deletedAt: true,
} as const;

export interface DocumentTotalsData {
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
}
