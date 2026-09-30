import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { PURCHASE_REQUEST_STATUS_LABELS, PURCHASE_REQUEST_STATUSES } from "@/config/inventory";
import { requestRow } from "@/features/inventory/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { purchaseRequestListQuerySchema } from "@/lib/validation";
import { purchaseRequestService } from "@/server/services/purchase-request.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Purchase requests" };

export default async function PurchaseRequestsPage({ searchParams }: PageProps<"/purchasing/requests">) {
  // Viewers see all requests; people who may only create requests see their own (checked in the service).
  const ctx = (await authorizePage("purchases:view")) ?? (await authorizePage("purchases:create"));
  if (!ctx) return <AccessDenied />;
  const query = purchaseRequestListQuerySchema
    .catch(purchaseRequestListQuerySchema.parse({}))
    .parse(await searchParams);
  const [result, company] = await Promise.all([purchaseRequestService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "purchases:create");

  return (
    <>
      <PageHeader
        title="Purchase requests"
        description="Step 1 of purchasing: someone asks for products, an approver (never the requester) approves, then it becomes a purchase order."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/purchasing/requests/new">
                <Plus aria-hidden="true" />
                New request
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((request) => requestRow(request, company))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Purchase requests",
          searchLabel: "Search purchase requests",
          searchPlaceholder: "Search the reason or a number like PR-0003…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: PURCHASE_REQUEST_STATUSES.map((status) => ({
            value: status,
            label: PURCHASE_REQUEST_STATUS_LABELS[status],
          })),
          columns: {
            code: "Request",
            reference: "Requested by",
            party: "For",
            date: "Requested",
            secondary: "Needed by",
            amount: "Lines",
          },
          empty: {
            icon: "request",
            title: "No purchase requests yet",
            description: "Ask for products to be bought; an approver decides before they are ordered.",
            ...(canCreate ? { createHref: "/purchasing/requests/new", createLabel: "New request" } : {}),
          },
        }}
      />
    </>
  );
}
