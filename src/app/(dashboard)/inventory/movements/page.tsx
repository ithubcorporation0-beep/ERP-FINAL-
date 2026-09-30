import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { STOCK_MOVEMENT_TYPE_LABELS, STOCK_MOVEMENT_TYPES } from "@/config/inventory";
import { movementRow } from "@/features/inventory/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { stockMovementListQuerySchema } from "@/lib/validation";
import { salesContext } from "@/server/services/sales-shared";
import { stockService } from "@/server/services/stock.service";

export const metadata: Metadata = { title: "Stock movements" };

export default async function StockMovementsPage({ searchParams }: PageProps<"/inventory/movements">) {
  const ctx = await authorizePage("inventory:view");
  if (!ctx) return <AccessDenied />;
  const query = stockMovementListQuerySchema
    .catch(stockMovementListQuerySchema.parse({}))
    .parse(await searchParams);
  const [result, company] = await Promise.all([stockService.list(ctx, query), salesContext(ctx)]);
  const canRecord = can(ctx, "inventory:create") || can(ctx, "inventory:edit");

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="The inventory history: every stock in, stock out, adjustment, transfer and goods receipt. Movements are never edited or deleted — a mistake is corrected with a new movement."
        actions={
          canRecord ? (
            <Button asChild>
              <Link href="/inventory/movements/new">
                <Plus aria-hidden="true" />
                Record stock movement
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((movement) => movementRow(movement, company))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Stock movements",
          searchLabel: "Search stock movements",
          searchPlaceholder: "Search product, SKU, reference or STK number…",
          filterKey: "type",
          filterLabel: "Types",
          filterOptions: STOCK_MOVEMENT_TYPES.map((type) => ({
            value: type,
            label: STOCK_MOVEMENT_TYPE_LABELS[type],
          })),
          columns: {
            code: "Movement",
            reference: "Reference",
            party: "Product",
            date: "Date",
            secondary: "Warehouse",
            amount: "Quantity",
          },
          empty: {
            icon: "stock",
            title: "No stock movements yet",
            description: "Record a stock in, or receive goods from a purchase order.",
            ...(canRecord
              ? { createHref: "/inventory/movements/new", createLabel: "Record stock movement" }
              : {}),
          },
        }}
      />
    </>
  );
}
