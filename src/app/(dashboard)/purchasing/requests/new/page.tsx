import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY_REQUEST } from "@/features/purchasing/defaults";
import { PurchaseRequestForm } from "@/features/purchasing/purchase-request-form";
import { authorizePage } from "@/lib/auth/page";
import { money } from "@/lib/money";
import { idSchema } from "@/lib/validation";
import { productService } from "@/server/services/product.service";
import { salesContext } from "@/server/services/sales-shared";
import { supplierService } from "@/server/services/supplier.service";

export const metadata: Metadata = { title: "New purchase request" };

export default async function NewPurchaseRequestPage({
  searchParams,
}: PageProps<"/purchasing/requests/new">) {
  const ctx = await authorizePage("purchases:create");
  if (!ctx) return <AccessDenied />;
  const [products, suppliers, { currency }] = await Promise.all([
    productService.options(ctx),
    supplierService.options(ctx),
    salesContext(ctx),
  ]);
  // "Request more" from a low-stock product preselects it.
  const productId = idSchema.safeParse((await searchParams).productId).data;
  const preselected = products.find((product) => product.id === productId);

  return (
    <>
      <PageHeader
        title="New purchase request"
        description="A Request ID is assigned automatically. An approver decides before anything is ordered."
      />
      <Card className="shadow-xs">
        <CardContent>
          {products.length === 0 ? (
            <EmptyState
              size="compact"
              title="No active products"
              description="Add products before requesting them."
            />
          ) : (
            <PurchaseRequestForm
              currency={currency}
              suppliers={suppliers}
              defaults={
                preselected
                  ? {
                      ...EMPTY_REQUEST,
                      supplierId: preselected.supplierId ?? "",
                      items: [
                        {
                          productId: preselected.id,
                          quantity: "1",
                          estimatedUnitPrice: money(preselected.purchasePrice),
                        },
                      ],
                    }
                  : EMPTY_REQUEST
              }
              products={products.map((product) => ({
                value: product.id,
                label: `${product.name} (${product.sku})`,
                unit: product.unit,
                price: money(product.purchasePrice),
              }))}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
