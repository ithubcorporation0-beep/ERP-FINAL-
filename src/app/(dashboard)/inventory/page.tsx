import type { Metadata } from "next";
import { ArrowRightLeft, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ProductFilters, ProductList } from "@/features/inventory/product-list";
import { toProductRow } from "@/features/inventory/rows";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { productListQuerySchema } from "@/lib/validation";
import { productCategoryService } from "@/server/services/product-category.service";
import { productService } from "@/server/services/product.service";
import { salesContext } from "@/server/services/sales-shared";
import { warehouseService } from "@/server/services/warehouse.service";

export const metadata: Metadata = { title: "Products & stock" };

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  // Server-side check: hiding the menu link is not protection.
  const ctx = await authorizePage("products:view");
  if (!ctx) return <AccessDenied />;

  const query = productListQuerySchema.catch(productListQuerySchema.parse({})).parse(await searchParams);
  const [result, format, categories, warehouses, low] = await Promise.all([
    productService.list(ctx, query),
    salesContext(ctx),
    productCategoryService.list(ctx),
    warehouseService.list(ctx),
    productService.lowStock(ctx),
  ]);
  const canCreate = can(ctx, "products:create");
  const canMove = can(ctx, "inventory:create") || can(ctx, "inventory:edit");

  return (
    <>
      <PageHeader
        title="Products & stock"
        description="Current stock is the sum of every stock movement — it changes only by recording one."
        actions={
          <>
            {canMove ? (
              <Button asChild variant="outline">
                <Link href="/inventory/movements/new">
                  <ArrowRightLeft aria-hidden="true" />
                  Record stock movement
                </Link>
              </Button>
            ) : null}
            {canCreate ? (
              <Button asChild>
                <Link href="/inventory/products/new">
                  <Plus aria-hidden="true" />
                  Add product
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-4">
        {low.length > 0 && query.stock !== "low" ? (
          <Alert role="status">
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>
              {low.length} {low.length === 1 ? "product is" : "products are"} at or below minimum stock
            </AlertTitle>
            <AlertDescription>
              <p>
                {low
                  .slice(0, 5)
                  .map((product) => product.name)
                  .join(", ")}
                {low.length > 5 ? ` and ${low.length - 5} more` : ""}.{" "}
                <Link href="/inventory?stock=low" className="font-medium text-primary hover:underline">
                  Show low-stock products
                </Link>
              </p>
            </AlertDescription>
          </Alert>
        ) : null}
        <ProductFilters
          categories={categories.map((category) => ({ value: category.id, label: category.name }))}
          warehouses={warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
        />
        <ProductList
          rows={result.items.map((product) => toProductRow(product, format))}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          canCreate={canCreate}
        />
      </div>
    </>
  );
}
