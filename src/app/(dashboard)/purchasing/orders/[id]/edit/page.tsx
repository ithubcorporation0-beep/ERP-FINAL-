import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { PurchaseOrderForm } from "@/features/purchasing/purchase-order-form";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { quantity, trimQuantity } from "@/lib/inventory";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { productService } from "@/server/services/product.service";
import { purchaseOrderService } from "@/server/services/purchase-order.service";
import { salesContext } from "@/server/services/sales-shared";
import { supplierService } from "@/server/services/supplier.service";
import { warehouseService } from "@/server/services/warehouse.service";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage({ params }: PageProps<"/purchasing/orders/[id]/edit">) {
  const ctx = await authorizePage("purchases:edit");
  if (!ctx) return <AccessDenied />;
  const order = await orNotFound(purchaseOrderService.get(ctx, recordIdOrNotFound((await params).id)));
  if (order.status !== "DRAFT") {
    return (
      <AccessDenied message="Only draft purchase orders can be edited. This one was already placed or cancelled." />
    );
  }
  const [products, suppliers, warehouses, company] = await Promise.all([
    productService.options(ctx),
    supplierService.options(ctx),
    warehouseService.options(ctx),
    salesContext(ctx),
  ]);
  const code = formatRecordNumber("purchaseOrder", order.number);

  return (
    <>
      <PageHeader title={`Edit ${code}`} description="Draft orders can be changed until they are placed." />
      <Card className="shadow-xs">
        <CardContent>
          <PurchaseOrderForm
            orderId={order.id}
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
              order.request ? formatRecordNumber("purchaseRequest", order.request.number) : undefined
            }
            defaults={{
              supplierId: order.supplierId,
              warehouseId: order.warehouseId,
              requestId: order.requestId ?? "",
              orderDate: dateToDateOnly(order.orderDate),
              expectedDate: order.expectedDate ? dateToDateOnly(order.expectedDate) : "",
              notes: order.notes ?? "",
              items: order.items.map((item) => ({
                productId: item.productId,
                quantity: trimQuantity(quantity(item.quantity)),
                unitPrice: money(item.unitPrice),
              })),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
