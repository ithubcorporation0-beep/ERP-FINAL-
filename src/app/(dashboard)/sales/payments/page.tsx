import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/config/sales";
import { paymentRow } from "@/features/sales/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { paymentListQuerySchema } from "@/lib/validation";
import { paymentService } from "@/server/services/payment.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage({ searchParams }: PageProps<"/sales/payments">) {
  const ctx = await authorizePage("payments:view");
  if (!ctx) return <AccessDenied />;
  const query = paymentListQuerySchema.catch(paymentListQuerySchema.parse({})).parse(await searchParams);
  const [result, sales] = await Promise.all([paymentService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "payments:create");

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received against invoices. Mistakes are voided, never deleted."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/sales/payments/new">
                <Plus aria-hidden="true" />
                Record payment
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((payment) => paymentRow(payment, sales))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Payments",
          searchLabel: "Search payments",
          searchPlaceholder: "Search payment ID, invoice, customer or reference…",
          filterKey: "method",
          filterLabel: "Methods",
          filterOptions: PAYMENT_METHODS.map((method) => ({
            value: method,
            label: PAYMENT_METHOD_LABELS[method],
          })),
          columns: {
            code: "Payment ID",
            reference: "Invoice",
            date: "Date",
            secondary: "Method",
            amount: "Amount",
          },
          empty: {
            icon: "payment",
            title: "No payments yet",
            description: "Record a payment when a customer pays an invoice.",
            ...(canCreate ? { createHref: "/sales/payments/new", createLabel: "Record payment" } : {}),
          },
        }}
      />
    </>
  );
}
