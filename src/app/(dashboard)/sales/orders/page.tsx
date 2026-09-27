import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { quotationRow } from "@/features/sales/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { quotationListQuerySchema } from "@/lib/validation";
import { quotationService } from "@/server/services/quotation.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Sales orders" };

export default async function SalesOrdersPage({ searchParams }: PageProps<"/sales/orders">) {
  const ctx = await authorizePage("quotations:view");
  if (!ctx) return <AccessDenied />;
  const query = quotationListQuerySchema
    .catch(quotationListQuerySchema.parse({}))
    .parse({ ...(await searchParams), orders: "1" });
  const [result, sales] = await Promise.all([quotationService.list(ctx, query), salesContext(ctx)]);

  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Quotations the customer accepted. Convert them into invoices when you deliver."
      />
      <SalesList
        rows={result.items.map((quotation) => quotationRow(quotation, sales, true))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Sales orders",
          searchLabel: "Search sales orders",
          searchPlaceholder: "Search customer or number…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: [
            { value: "CONFIRMED", label: "Open (not invoiced)" },
            { value: "INVOICED", label: "Invoiced" },
            { value: "CANCELLED", label: "Cancelled" },
          ],
          columns: { code: "Order", reference: "Quotation", date: "Quotation date", amount: "Total" },
          empty: {
            icon: "quote",
            title: "No sales orders yet",
            description: "Open a quotation and choose “Mark as accepted” to turn it into a sales order.",
          },
        }}
      />
    </>
  );
}
