import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { QUOTATION_DISPLAY_STATUSES, QUOTATION_STATUS_LABELS } from "@/config/sales";
import { quotationRow } from "@/features/sales/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { quotationListQuerySchema } from "@/lib/validation";
import { quotationService } from "@/server/services/quotation.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: PageProps<"/sales/quotations">) {
  const ctx = await authorizePage("quotations:view");
  if (!ctx) return <AccessDenied />;
  const query = quotationListQuerySchema.catch(quotationListQuerySchema.parse({})).parse(await searchParams);
  const [result, sales] = await Promise.all([quotationService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "quotations:create");

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Price offers. When the customer accepts, a quotation becomes a sales order and then an invoice."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/sales/quotations/new">
                <Plus aria-hidden="true" />
                New quotation
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((quotation) => quotationRow(quotation, sales))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Quotations",
          searchLabel: "Search quotations",
          searchPlaceholder: "Search customer or number (QUO-0001, SO-0001)…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: QUOTATION_DISPLAY_STATUSES.map((status) => ({
            value: status,
            label: QUOTATION_STATUS_LABELS[status],
          })),
          columns: {
            code: "Quotation",
            reference: "Order",
            date: "Date",
            secondary: "Valid until",
            amount: "Total",
          },
          empty: {
            icon: "quote",
            title: "No quotations yet",
            description: "Create a quotation, send it by email or WhatsApp and convert it into an invoice.",
            ...(canCreate ? { createHref: "/sales/quotations/new", createLabel: "New quotation" } : {}),
          },
        }}
      />
    </>
  );
}
