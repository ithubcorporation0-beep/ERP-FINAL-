import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EMPTY_LINE } from "@/features/sales/defaults";
import { SalesDocumentForm } from "@/features/sales/sales-document-form";
import { authorizePage } from "@/lib/auth/page";
import { idSchema } from "@/lib/validation";
import { customerService } from "@/server/services/customer.service";
import { quotationService } from "@/server/services/quotation.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: PageProps<"/sales/quotations/new">) {
  const ctx = await authorizePage("quotations:create");
  if (!ctx) return <AccessDenied />;
  const params = await searchParams;
  const [customers, defaults, sales] = await Promise.all([
    customerService.options(ctx),
    quotationService.defaults(ctx),
    salesContext(ctx),
  ]);
  const customerId = idSchema.safeParse(params.customerId);
  const leadId = idSchema.safeParse(params.leadId);

  return (
    <>
      <PageHeader title="New quotation" description="A quotation number is assigned when you save." />
      <Card className="shadow-xs">
        <CardContent>
          <SalesDocumentForm
            kind="quotation"
            customers={customers}
            currency={sales.currency}
            locale={sales.locale}
            defaults={{
              customerId: customerId.success ? customerId.data : "",
              leadId: leadId.success ? leadId.data : "",
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
