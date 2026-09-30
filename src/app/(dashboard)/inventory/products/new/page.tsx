import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY_PRODUCT } from "@/features/inventory/defaults";
import { ProductForm } from "@/features/inventory/product-form";
import { authorizePage } from "@/lib/auth/page";
import { productService } from "@/server/services/product.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  const ctx = await authorizePage("products:create");
  if (!ctx) return <AccessDenied />;
  const [options, { currency }] = await Promise.all([productService.formOptions(ctx), salesContext(ctx)]);
  return (
    <>
      <PageHeader
        title="New product"
        description="A Product ID is assigned automatically. Stock starts at 0 — record a stock in or receive a purchase order to add stock."
      />
      <Card className="shadow-xs">
        <CardContent>
          <ProductForm defaults={EMPTY_PRODUCT} currency={currency} {...options} />
        </CardContent>
      </Card>
    </>
  );
}
