import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { ProductForm } from "@/features/inventory/product-form";
import { authorizePage } from "@/lib/auth/page";
import { quantity, trimQuantity } from "@/lib/inventory";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { productService } from "@/server/services/product.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/inventory/products/[id]/edit">) {
  const ctx = await authorizePage("products:edit");
  if (!ctx) return <AccessDenied />;
  const product = await orNotFound(productService.get(ctx, recordIdOrNotFound((await params).id)));
  const [options, { currency }] = await Promise.all([productService.formOptions(ctx), salesContext(ctx)]);
  // Keep the current supplier / warehouse selectable even if they were deactivated since.
  if (product.supplier && !options.suppliers.some((option) => option.value === product.supplier?.id)) {
    options.suppliers.push({ value: product.supplier.id, label: `${product.supplier.name} (inactive)` });
  }
  if (product.warehouse && !options.warehouses.some((option) => option.value === product.warehouse?.id)) {
    options.warehouses.push({ value: product.warehouse.id, label: `${product.warehouse.name} (inactive)` });
  }

  return (
    <>
      <PageHeader
        title={`Edit ${product.name}`}
        description={`Product ID ${formatRecordNumber("product", product.number)}. Stock is changed with stock movements, not here.`}
      />
      <Card className="shadow-xs">
        <CardContent>
          <ProductForm
            productId={product.id}
            currency={currency}
            {...options}
            defaults={{
              sku: product.sku,
              name: product.name,
              categoryId: product.categoryId ?? "",
              brand: product.brand ?? "",
              unit: product.unit,
              purchasePrice: money(product.purchasePrice),
              sellingPrice: money(product.sellingPrice),
              minimumStock: trimQuantity(quantity(product.minimumStock)),
              supplierId: product.supplierId ?? "",
              warehouseId: product.warehouseId ?? "",
              description: product.description ?? "",
              isActive: product.isActive,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
