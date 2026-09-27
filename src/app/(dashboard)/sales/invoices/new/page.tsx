import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY_LINE } from "@/features/sales/defaults";
import { SalesDocumentForm } from "@/features/sales/sales-document-form";
import { authorizePage } from "@/lib/auth/page";
import { idSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";
import { invoiceService } from "@/server/services/invoice.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/sales/invoices/new">) {
  const ctx = await authorizePage("invoices:create");
  if (!ctx) return <AccessDenied />;
  const [customers, defaults, sales] = await Promise.all([
    customerService.options(ctx),
    invoiceService.defaults(ctx),
    salesContext(ctx),
  ]);
  const customerId = idSchema.safeParse((await searchParams).customerId);

  return (
    <>
      <PageHeader
        title="New invoice"
        description="The invoice number is issued when you save and never changes."
      />
      <Card className="shadow-xs">
        <CardContent>
          <SalesDocumentForm
            kind="invoice"
            customers={customers}
            currency={sales.currency}
            locale={sales.locale}
            defaults={{
              customerId: customerId.success ? customerId.data : "",
              issueDate: defaults.issueDate,
              endDate: defaults.endDate,
              items: [{ ...EMPTY_LINE }],
              notes: "",
              terms: defaults.terms,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
