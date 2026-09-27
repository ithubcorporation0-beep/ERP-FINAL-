import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { INVOICE_STATUS_LABELS, invoiceDisplayStatus } from "@/config/sales";
import { HistoryList } from "@/features/crm/history-list";
import { DocumentView } from "@/features/sales/document-view";
import { InvoiceToolbar } from "@/features/sales/invoice-toolbar";
import { INVOICE_STATUS_TONES } from "@/features/sales/labels";
import { PaymentsTable } from "@/features/sales/payments-table";
import { paymentEntry } from "@/features/sales/rows";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { formatDateTime, formatMoney } from "@/lib/format";
import { compareMoney, money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { invoiceBalance, invoiceService } from "@/server/services/invoice.service";
import { paymentService } from "@/server/services/payment.service";
import { salesContext } from "@/server/services/sales-shared";
import { shellService } from "@/server/services/shell.service";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/sales/invoices/[id]">) {
  const ctx = await authorizePage("invoices:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const { view, invoice } = await orNotFound(invoiceService.presentation(ctx, id));
  const canSeePayments = can(ctx, "payments:view");
  const [history, sales, shell, payments] = await Promise.all([
    invoiceService.history(ctx, id),
    salesContext(ctx),
    shellService.getContext(ctx),
    canSeePayments ? paymentService.listForInvoice(ctx, id) : Promise.resolve([]),
  ]);
  const status = invoiceDisplayStatus(invoice.status, dateToDateOnly(invoice.dueDate), sales.today);
  const format = { locale: sales.locale, timeZone: sales.timeZone, currency: invoice.currency };
  const balance = invoiceBalance(invoice);
  const quotation = invoice.quotation;

  return (
    <>
      <PageHeader title={`Invoice ${invoice.code}`} description={invoice.customer.name} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge tone={INVOICE_STATUS_TONES[status]}>{INVOICE_STATUS_LABELS[status]}</StatusBadge>
        {invoice.status !== "DRAFT" && invoice.status !== "CANCELLED" ? (
          <span className="text-sm" data-numeric>
            Balance due: <strong>{formatMoney(balance, format)}</strong>
          </span>
        ) : null}
        {quotation ? (
          <Link href={`/sales/quotations/${quotation.id}`} className="text-sm text-primary hover:underline">
            From{" "}
            {quotation.orderNumber === null
              ? formatRecordNumber("quotation", quotation.number)
              : formatRecordNumber("order", quotation.orderNumber)}
          </Link>
        ) : null}
      </div>
      <div className="mb-6">
        <InvoiceToolbar
          id={id}
          code={invoice.code}
          status={invoice.status}
          hasPayments={compareMoney(money(invoice.amountPaid), "0.00") > 0}
          customer={{
            email: invoice.customer.email,
            phone: invoice.customer.whatsapp ?? invoice.customer.phone,
          }}
          whatsappMessage={`Hello ${invoice.customer.name}, here is invoice ${invoice.code} from ${sales.company.name}. Balance due: ${formatMoney(balance, format)}.`}
          can={{
            edit: can(ctx, "invoices:edit"),
            delete: can(ctx, "invoices:delete"),
            pay: can(ctx, "payments:create"),
          }}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <DocumentView view={view} logoUrl={shell.company.logoUrl} />
          {canSeePayments ? (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Payments</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentsTable
                  caption={`Payments of ${invoice.code}`}
                  canVoid={can(ctx, "payments:delete")}
                  payments={payments.map((payment) => paymentEntry(payment, sales))}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
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
