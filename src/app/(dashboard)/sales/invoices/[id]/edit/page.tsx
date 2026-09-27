import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SalesDocumentForm } from "@/features/sales/sales-document-form";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { customerService } from "@/server/services/customer.service";
import { invoiceService } from "@/server/services/invoice.service";
import { itemsToInput, salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: PageProps<"/sales/invoices/[id]/edit">) {
  const ctx = await authorizePage("invoices:edit");
  if (!ctx) return <AccessDenied />;
  const document = await orNotFound(invoiceService.get(ctx, recordIdOrNotFound((await params).id)));
  if (document.status !== "DRAFT") {
    return (
      <EmptyState
        title="This document can't be edited"
        description="Only draft invoices can be edited. Cancel an issued invoice and create a new one instead."
      />
    );
  }
  const [customers, sales] = await Promise.all([customerService.options(ctx), salesContext(ctx)]);

  return (
    <>
      <PageHeader title="Edit invoice" description={document.customer.name} />
      <Card className="shadow-xs">
        <CardContent>
          <SalesDocumentForm
            kind="invoice"
            documentId={document.id}
            customers={customers}
            currency={document.currency}
            locale={sales.locale}
            defaults={{
              customerId: document.customerId,

              issueDate: dateToDateOnly(document.invoiceDate),
              endDate: dateToDateOnly(document.dueDate),
              items: itemsToInput(document.items),
              notes: document.notes ?? "",
              terms: document.terms ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
