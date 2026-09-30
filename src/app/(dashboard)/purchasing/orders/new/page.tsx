import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { emptyOrder } from "@/features/purchasing/defaults";
import { PurchaseOrderForm } from "@/features/purchasing/purchase-order-form";
import { authorizePage } from "@/lib/auth/page";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { quantity, trimQuantity } from "@/lib/inventory";
import { money } from "@/lib/money";
import { idSchema } from "@/lib/validation";
import { productService } from "@/server/services/product.service";
import { purchaseRequestService } from "@/server/services/purchase-request.service";
import { salesContext } from "@/server/services/sales-shared";
import { supplierService } from "@/server/services/supplier.service";
import { warehouseService } from "@/server/services/warehouse.service";

export const metadata: Metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchasing/orders/new">) {
  const ctx = await authorizePage("purchases:create");
  if (!ctx) return <AccessDenied />;
  const search = await searchParams;
  const requestId = idSchema.safeParse(search.requestId).data;
  const supplierId = idSchema.safeParse(search.supplierId).data;
  const [products, suppliers, warehouses, company, request] = await Promise.all([
    productService.options(ctx),
    supplierService.options(ctx),
    warehouseService.options(ctx),
    salesContext(ctx),
    requestId
      ? purchaseRequestService.get(ctx, requestId).catch((error: unknown) => {
          // A request from the URL that isn't visible just isn't prefilled; anything else is a real error.
          if (error instanceof NotFoundError || error instanceof ForbiddenError) return null;
          throw error;
        })
      : null,
  ]);
  const fromRequest = request && request.status === "APPROVED" ? request : null;
  const defaults = emptyOrder(company.today);
  const preselectedSupplier = fromRequest?.supplierId ?? supplierId;
  const supplier = suppliers.some((option) => option.value === preselectedSupplier)
    ? preselectedSupplier
    : "";

  return (
    <>
      <PageHeader
        title="New purchase order"
        description="Saved as a draft; place it with the supplier when it's ready."
      />
      <Card className="shadow-xs">
        <CardContent>
          {products.length === 0 || suppliers.length === 0 || warehouses.length === 0 ? (
            <EmptyState
              size="compact"
              title="Set up purchasing first"
              description="You need at least one active supplier, product and warehouse."
            />
          ) : (
            <PurchaseOrderForm
              locale={company.locale}
              currency={company.currency}
              suppliers={suppliers}
              warehouses={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
              products={products.map((product) => ({
                value: product.id,
                label: `${product.name} (${product.sku})`,
                unit: product.unit,
                price: money(product.purchasePrice),
              }))}
              requestLabel={
                fromRequest ? formatRecordNumber("purchaseRequest", fromRequest.number) : undefined
              }
              defaults={{
                ...defaults,
                supplierId: supplier ?? "",
                warehouseId: warehouses[0]?.id ?? "",
                requestId: fromRequest?.id ?? "",
                items: fromRequest
                  ? fromRequest.items.map((item) => ({
                      productId: item.productId,
                      quantity: trimQuantity(quantity(item.quantity)),
                      unitPrice: money(item.estimatedUnitPrice ?? item.product.purchasePrice),
                    }))
                  : defaults.items,
              }}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
