import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { STOCK_OPERATIONS } from "@/config/inventory";
import { emptyStockOperation } from "@/features/inventory/defaults";
import { StockOperationForm } from "@/features/inventory/stock-operation-form";
import { authorizePage } from "@/lib/auth/page";
import { money } from "@/lib/money";
import { can } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";
import { productService } from "@/server/services/product.service";
import { salesContext } from "@/server/services/sales-shared";
import { stockService } from "@/server/services/stock.service";
import { warehouseService } from "@/server/services/warehouse.service";

export const metadata: Metadata = { title: "Record stock movement" };

export default async function NewStockMovementPage({ searchParams }: PageProps<"/inventory/movements/new">) {
  const ctx = await authorizePage("inventory:view");
  if (!ctx) return <AccessDenied />;
  const operations = STOCK_OPERATIONS.filter((operation) =>
    can(ctx, operation === "ADJUST" ? "inventory:edit" : "inventory:create"),
  );
  if (operations.length === 0) return <AccessDenied />;
  const [products, warehouses, levels, { currency, today }] = await Promise.all([
    productService.options(ctx),
    warehouseService.options(ctx),
    stockService.levelMap(ctx),
    salesContext(ctx),
  ]);
  const productId = idSchema.safeParse((await searchParams).productId).data;
  const preselected = products.find((product) => product.id === productId);
  const defaults = {
    ...emptyStockOperation(today),
    operation: operations[0] ?? "IN",
    productId: preselected?.id ?? "",
    warehouseId: preselected?.warehouseId ?? warehouses[0]?.id ?? "",
  };

  return (
    <>
      <PageHeader
        title="Record stock movement"
        description="Stock only changes through movements like this one, so the inventory history always explains the current stock."
      />
      <Card className="shadow-xs">
        <CardContent>
          {products.length === 0 || warehouses.length === 0 ? (
            <EmptyState
              size="compact"
              title={products.length === 0 ? "No active products" : "No active warehouses"}
              description="Add at least one product and one warehouse first."
            />
          ) : (
            <StockOperationForm
              defaults={defaults}
              operations={[...operations]}
              currency={currency}
              levels={levels}
              backHref={preselected ? `/inventory/products/${preselected.id}` : "/inventory/movements"}
              warehouses={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
              products={products.map((product) => ({
                value: product.id,
                label: `${product.name} (${product.sku})`,
                unit: product.unit,
                purchasePrice: money(product.purchasePrice),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
