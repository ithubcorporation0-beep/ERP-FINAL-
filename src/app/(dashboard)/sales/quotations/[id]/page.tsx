import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUOTATION_STATUS_LABELS, quotationDisplayStatus } from "@/config/sales";
import { HistoryList } from "@/features/crm/history-list";
import { DocumentView } from "@/features/sales/document-view";
import { QUOTATION_STATUS_TONES } from "@/features/sales/labels";
import { QuotationToolbar } from "@/features/sales/quotation-toolbar";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { formatDateTime } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { quotationCode, quotationService } from "@/server/services/quotation.service";
import { salesContext } from "@/server/services/sales-shared";
import { shellService } from "@/server/services/shell.service";

export const metadata: Metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: PageProps<"/sales/quotations/[id]">) {
  const ctx = await authorizePage("quotations:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const { view, quotation } = await orNotFound(quotationService.presentation(ctx, id));
  const [history, sales, shell] = await Promise.all([
    quotationService.history(ctx, id),
    salesContext(ctx),
    shellService.getContext(ctx),
  ]);
  const { code, orderCode } = quotationCode(quotation);
  const status = quotationDisplayStatus(quotation.status, dateToDateOnly(quotation.expiryDate), sales.today);
  const format = { locale: sales.locale, timeZone: sales.timeZone, currency: sales.currency };

  return (
    <>
      <PageHeader
        title={orderCode ? `Sales order ${orderCode}` : `Quotation ${code}`}
        description={`${quotation.customer.name}${orderCode ? ` · from quotation ${code}` : ""}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={QUOTATION_STATUS_TONES[status]}>{QUOTATION_STATUS_LABELS[status]}</StatusBadge>
        {quotation.lead ? (
          <Link href={`/crm/leads/${quotation.lead.id}`} className="text-sm text-primary hover:underline">
            From lead: {quotation.lead.name}
          </Link>
        ) : null}
        {quotation.invoices.map((invoice) => (
          <Link
            key={invoice.id}
            href={`/sales/invoices/${invoice.id}`}
            className="text-sm text-primary hover:underline"
          >
            Invoice {invoice.code}
          </Link>
        ))}
      </div>
      <div className="mb-6">
        <QuotationToolbar
          id={id}
          code={orderCode ?? code}
          status={quotation.status}
          customer={{
            email: quotation.customer.email,
            phone: quotation.customer.whatsapp ?? quotation.customer.phone,
          }}
          whatsappMessage={`Hello ${quotation.customer.name}, here is ${orderCode ? "sales order" : "quotation"} ${orderCode ?? code} from ${sales.company.name}:`}
          can={{
            edit: can(ctx, "quotations:edit"),
            create: can(ctx, "quotations:create"),
            delete: can(ctx, "quotations:delete"),
            invoice: can(ctx, "invoices:create"),
          }}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <DocumentView view={view} logoUrl={shell.company.logoUrl} />
        <Card className="h-fit shadow-xs">
          <CardHeader>
            <CardTitle>
              <h2>History</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryList
              items={history.map((entry) => ({
                ...entry,
                at: entry.at.toISOString(),
                atLabel: formatDateTime(entry.at, format),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
