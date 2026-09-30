import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { SUPPLIER_INVOICE_STATUS_LABELS, SUPPLIER_INVOICE_STATUSES } from "@/config/inventory";
import { billRow } from "@/features/inventory/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { supplierInvoiceListQuerySchema } from "@/lib/validation";
import { salesContext } from "@/server/services/sales-shared";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";

export const metadata: Metadata = { title: "Supplier invoices" };

export default async function SupplierInvoicesPage({ searchParams }: PageProps<"/purchasing/bills">) {
  const ctx = await authorizePage("purchases:view");
  if (!ctx) return <AccessDenied />;
  const query = supplierInvoiceListQuerySchema
    .catch(supplierInvoiceListQuerySchema.parse({}))
    .parse(await searchParams);
  const [result, company] = await Promise.all([supplierInvoiceService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "accounting:create");

  return (
    <>
      <PageHeader
        title="Supplier invoices"
        description="Steps 4 and 5: record the supplier's bill (posted to Accounts Payable), then pay it."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/purchasing/bills/new">
                <Plus aria-hidden="true" />
                Record supplier invoice
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((bill) => billRow(bill, company))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Supplier invoices",
          searchLabel: "Search supplier invoices",
          searchPlaceholder: "Search supplier, their invoice number or BILL-0003…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: SUPPLIER_INVOICE_STATUSES.map((status) => ({
            value: status,
            label: SUPPLIER_INVOICE_STATUS_LABELS[status],
          })),
          columns: {
            code: "Bill",
            reference: "Supplier's number",
            party: "Supplier",
            date: "Invoice date",
            secondary: "Due",
            amount: "Total",
            balance: "Balance",
          },
          empty: {
            icon: "bill",
            title: "No supplier invoices yet",
            description: "Record a bill when a supplier invoices you, usually against a purchase order.",
            ...(canCreate
              ? { createHref: "/purchasing/bills/new", createLabel: "Record supplier invoice" }
              : {}),
          },
        }}
      />
    </>
  );
}
