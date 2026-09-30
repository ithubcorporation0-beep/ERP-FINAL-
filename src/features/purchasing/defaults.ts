import type {
  PurchaseOrderInput,
  PurchaseRequestInput,
  SupplierInput,
  SupplierInvoiceInput,
} from "@/lib/validation";

/** Form defaults, outside "use client" modules so server pages can spread them. */
export const EMPTY_SUPPLIER: SupplierInput = {
  name: "",
  companyName: "",
  phone: "",
  email: "",
  address: "",
  taxId: "",
  notes: "",
};

export const EMPTY_REQUEST: PurchaseRequestInput = {
  supplierId: "",
  neededBy: "",
  reason: "",
  items: [{ productId: "", quantity: "1", estimatedUnitPrice: "" }],
};

export function emptyOrder(today: string): PurchaseOrderInput {
  return {
    supplierId: "",
    warehouseId: "",
    requestId: "",
    orderDate: today,
    expectedDate: "",
    notes: "",
    items: [{ productId: "", quantity: "1", unitPrice: "0.00" }],
  };
}

export function emptyBill(today: string): SupplierInvoiceInput {
  return {
    supplierId: "",
    orderId: "",
    supplierReference: "",
    invoiceDate: today,
    dueDate: "",
    subtotal: "",
    taxAmount: "0.00",
    notes: "",
  };
}
