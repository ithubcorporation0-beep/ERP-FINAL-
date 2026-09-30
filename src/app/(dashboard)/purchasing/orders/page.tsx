import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { PURCHASE_ORDER_STATUS_LABELS, PURCHASE_ORDER_STATUSES } from "@/config/inventory";
import { orderRow } from "@/features/inventory/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { purchaseOrderListQuerySchema } from "@/lib/validation";
import { purchaseOrderService } from "@/server/services/purchase-order.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchasing/orders">) {
  const ctx = await authorizePage("purchases:view");
  if (!ctx) return <AccessDenied />;
  const query = purchaseOrderListQuerySchema
    .catch(purchaseOrderListQuerySchema.parse({}))
    .parse(await searchParams);
  const [result, company] = await Promise.all([purchaseOrderService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "purchases:create");

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Step 2: order from a supplier. Receiving the goods adds them to stock; the supplier's invoice is recorded against the order."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/purchasing/orders/new">
                <Plus aria-hidden="true" />
                New purchase order
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((order) => orderRow(order, company))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Purchase orders",
          searchLabel: "Search purchase orders",
          searchPlaceholder: "Search supplier, notes or a number like PO-0003…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: PURCHASE_ORDER_STATUSES.map((status) => ({
            value: status,
            label: PURCHASE_ORDER_STATUS_LABELS[status],
          })),
          columns: {
            code: "Order",
            reference: "Warehouse",
            party: "Supplier",
            date: "Order date",
            secondary: "Expected",
            amount: "Total",
          },
          empty: {
            icon: "purchase",
            title: "No purchase orders yet",
            description: "Create one directly or from an approved purchase request.",
            ...(canCreate ? { createHref: "/purchasing/orders/new", createLabel: "New purchase order" } : {}),
          },
        }}
      />
    </>
  );
}
