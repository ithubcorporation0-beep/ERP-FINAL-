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
import { quotationService } from "@/server/services/quotation.service";
import { itemsToInput, salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params }: PageProps<"/sales/quotations/[id]/edit">) {
  const ctx = await authorizePage("quotations:edit");
  if (!ctx) return <AccessDenied />;
  const document = await orNotFound(quotationService.get(ctx, recordIdOrNotFound((await params).id)));
  if (!["DRAFT", "SENT"].includes(document.status)) {
    return (
      <EmptyState
        title="This document can't be edited"
        description="Only draft and sent quotations can be edited."
      />
    );
  }
  const [customers, sales] = await Promise.all([customerService.options(ctx), salesContext(ctx)]);

  return (
    <>
      <PageHeader title="Edit quotation" description={document.customer.name} />
      <Card className="shadow-xs">
        <CardContent>
          <SalesDocumentForm
            kind="quotation"
            documentId={document.id}
            customers={customers}
            currency={document.currency}
            locale={sales.locale}
            defaults={{
              customerId: document.customerId,
              leadId: document.leadId ?? "",
              issueDate: dateToDateOnly(document.quoteDate),
              endDate: dateToDateOnly(document.expiryDate),
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
