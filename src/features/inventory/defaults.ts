import type { ProductInput, StockOperationInput } from "@/lib/validation";

/** Form defaults, outside "use client" modules so server pages can spread them. */
export const EMPTY_PRODUCT: ProductInput = {
  sku: "",
  name: "",
  categoryId: "",
  brand: "",
  unit: "pcs",
  purchasePrice: "0.00",
  sellingPrice: "0.00",
  minimumStock: "0",
  supplierId: "",
  warehouseId: "",
  description: "",
};

export function emptyStockOperation(today: string): StockOperationInput {
  return {
    operation: "IN",
    productId: "",
    warehouseId: "",
    toWarehouseId: "",
    quantity: "",
    unitCost: "",
    movementDate: today,
    reference: "",
    note: "",
  };
}
