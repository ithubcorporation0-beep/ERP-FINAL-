import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { INVOICE_DISPLAY_STATUSES, INVOICE_STATUS_LABELS } from "@/config/sales";
import { invoiceRow } from "@/features/sales/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { invoiceListQuerySchema } from "@/lib/validation";
import { invoiceService } from "@/server/services/invoice.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: PageProps<"/sales/invoices">) {
  const ctx = await authorizePage("invoices:view");
  if (!ctx) return <AccessDenied />;
  const query = invoiceListQuerySchema.catch(invoiceListQuerySchema.parse({})).parse(await searchParams);
  const [result, sales] = await Promise.all([invoiceService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "invoices:create");

  return (
    <>
      <PageHeader
        title="Invoices"
        description="What customers owe you, what they paid and what is overdue."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/sales/invoices/new">
                <Plus aria-hidden="true" />
                New invoice
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((invoice) => invoiceRow(invoice, sales))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Invoices",
          searchLabel: "Search invoices",
          searchPlaceholder: "Search invoice number or customer…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: INVOICE_DISPLAY_STATUSES.map((status) => ({
            value: status,
            label: INVOICE_STATUS_LABELS[status],
          })),
          columns: { code: "Invoice", date: "Date", secondary: "Due", amount: "Total", balance: "Balance" },
          empty: {
            icon: "invoice",
            title: "No invoices yet",
            description: "Create an invoice directly or convert an accepted quotation.",
            ...(canCreate ? { createHref: "/sales/invoices/new", createLabel: "New invoice" } : {}),
          },
        }}
      />
    </>
  );
}
