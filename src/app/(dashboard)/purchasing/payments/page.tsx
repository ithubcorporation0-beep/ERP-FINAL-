import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { supplierPaymentRow } from "@/features/inventory/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { supplierPaymentListQuerySchema } from "@/lib/validation";
import { salesContext } from "@/server/services/sales-shared";
import { supplierInvoiceService } from "@/server/services/supplier-invoice.service";
import { supplierService } from "@/server/services/supplier.service";

export const metadata: Metadata = { title: "Supplier payments" };

export default async function SupplierPaymentsPage({ searchParams }: PageProps<"/purchasing/payments">) {
  const ctx = await authorizePage("purchases:view");
  if (!ctx) return <AccessDenied />;
  const query = supplierPaymentListQuerySchema
    .catch(supplierPaymentListQuerySchema.parse({}))
    .parse(await searchParams);
  const [result, company, suppliers] = await Promise.all([
    supplierInvoiceService.payments(ctx, query),
    salesContext(ctx),
    supplierService.options(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Supplier payments"
        description="Money paid to suppliers. Record a payment from the supplier invoice; a mistake is voided, never deleted."
      />
      <SalesList
        rows={result.items.map((payment) => supplierPaymentRow(payment, company))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Supplier payments",
          searchLabel: "Search supplier payments",
          searchPlaceholder: "Search supplier, reference or SPAY-0003…",
          filterKey: "supplierId",
          filterLabel: "Suppliers",
          filterOptions: suppliers,
          columns: {
            code: "Payment",
            reference: "Bill",
            party: "Supplier",
            date: "Date",
            secondary: "Method",
            amount: "Amount",
          },
          empty: {
            icon: "payment",
            title: "No supplier payments yet",
            description: "Open a supplier invoice and record a payment against it.",
          },
        }}
      />
    </>
  );
}
