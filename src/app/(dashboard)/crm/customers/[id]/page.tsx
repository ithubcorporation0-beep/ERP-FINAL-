import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  formatRecordNumber,
  LEAD_STATUS_LABELS,
} from "@/config/crm";
import { CommunicationPanel } from "@/features/crm/communication-panel";
import { DeleteRecordButton } from "@/features/crm/delete-record-button";
import { DetailList } from "@/features/crm/detail-list";
import { DocumentPanel } from "@/features/crm/document-panel";
import { countryName, formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { HistoryList } from "@/features/crm/history-list";
import { CUSTOMER_STATUS_TONES, LEAD_STATUS_TONES } from "@/features/crm/labels";
import { RelatedUnavailable } from "@/features/crm/related-unavailable";
import { invoiceRow, paymentRow, quotationRow } from "@/features/sales/rows";
import { SalesRowsTable } from "@/features/sales/sales-rows-table";
import { authorizePage } from "@/lib/auth/page";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { quotationListQuerySchema } from "@/lib/validation";
import { deleteCustomerAction } from "@/server/actions/customer.actions";
import { companyService } from "@/server/services/company.service";
import { customerCommunicationService } from "@/server/services/customer-communication.service";
import { customerDocumentService } from "@/server/services/customer-document.service";
import { customerService } from "@/server/services/customer.service";
import { invoiceService } from "@/server/services/invoice.service";
import { paymentService } from "@/server/services/payment.service";
import { quotationService } from "@/server/services/quotation.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Customer" };

/** wa.me needs digits only (with country code). */
function whatsappLink(number: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}

export default async function CustomerPage({ params }: PageProps<"/crm/customers/[id]">) {
  const ctx = await authorizePage("customers:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const customer = await orNotFound(customerService.get(ctx, id));
  const sees = {
    quotations: can(ctx, "quotations:view"),
    invoices: can(ctx, "invoices:view"),
    payments: can(ctx, "payments:view"),
  };
  const [format, communications, documents, history, leads, quotations, invoices, payments, sales] =
    await Promise.all([
      companyService.formatting(ctx),
      customerCommunicationService.list(ctx, id),
      customerDocumentService.list(ctx, id),
      customerService.history(ctx, id),
      customerService.convertedLeads(ctx, id),
      sees.quotations
        ? quotationService.list(ctx, quotationListQuerySchema.parse({ customerId: id, pageSize: 100 }))
        : null,
      sees.invoices ? invoiceService.listForCustomer(ctx, id) : null,
      sees.payments ? paymentService.listForCustomer(ctx, id) : null,
      salesContext(ctx),
    ]);
  const canEdit = can(ctx, "customers:edit");
  const code = formatRecordNumber("customer", customer.number);

  return (
    <>
      <PageHeader
        title={customer.name}
        description={[code, customer.companyName].filter(Boolean).join(" · ")}
        actions={
          <>
            {canEdit ? (
              <Button asChild variant="outline">
                <Link href={`/crm/customers/${id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {can(ctx, "customers:delete") ? (
              <DeleteRecordButton
                noun="customer"
                name={customer.name}
                action={deleteCustomerAction.bind(null, id)}
                redirectTo="/crm/customers"
              />
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone={CUSTOMER_STATUS_TONES[customer.status]}>
          {CUSTOMER_STATUS_LABELS[customer.status]}
        </StatusBadge>
        <Badge variant="outline">{CUSTOMER_TYPE_LABELS[customer.type]}</Badge>
      </div>

      <Tabs defaultValue="overview">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="communication">Communication ({communications.total})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
            {quotations ? (
              <TabsTrigger value="quotations">Quotations ({quotations.total})</TabsTrigger>
            ) : null}
            {invoices ? <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger> : null}
            {payments ? <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger> : null}
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="shadow-xs lg:col-span-2">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Customer ID", value: <span className="font-mono">{code}</span> },
                  { label: "Company", value: customer.companyName },
                  {
                    label: "Email",
                    value: customer.email ? (
                      <a className="text-primary hover:underline" href={`mailto:${customer.email}`}>
                        {customer.email}
                      </a>
                    ) : null,
                  },
                  {
                    label: "Phone",
                    value: customer.phone ? (
                      <a
                        className="text-primary hover:underline"
                        href={`tel:${customer.phone.replace(/\s/g, "")}`}
                      >
                        {customer.phone}
                      </a>
                    ) : null,
                  },
                  {
                    label: "WhatsApp",
                    value: customer.whatsapp ? (
                      <a
                        className="text-primary hover:underline"
                        href={whatsappLink(customer.whatsapp)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {customer.whatsapp}
                      </a>
                    ) : null,
                  },
                  { label: "Tax number", value: customer.taxId },
                  { label: "Address", value: customer.address },
                  { label: "City", value: customer.city },
                  { label: "Country", value: countryName(customer.country, format.locale) },
                  { label: "Customer type", value: CUSTOMER_TYPE_LABELS[customer.type] },
                  {
                    label: "Created",
                    value: `${formatDate(customer.createdAt, format)}${customer.createdBy ? ` by ${customer.createdBy.name}` : ""}`,
                  },
                  {
                    label: "Last updated",
                    value: `${formatDateTime(customer.updatedAt, format)}${customer.updatedBy ? ` by ${customer.updatedBy.name}` : ""}`,
                  },
                ]}
              />
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Notes</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {customer.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes.</p>
                )}
              </CardContent>
            </Card>
            {leads && leads.length > 0 ? (
              <Card className="shadow-xs">
                <CardHeader>
                  <CardTitle>
                    <h2>Converted from</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {leads.map((lead) => (
                      <li key={lead.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/crm/leads/${lead.id}`} className="text-primary hover:underline">
                          {lead.code} · {lead.name}
                        </Link>
                        <StatusBadge tone={LEAD_STATUS_TONES[lead.status]}>
                          {LEAD_STATUS_LABELS[lead.status]}
                        </StatusBadge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="communication">
          <CommunicationPanel
            customerId={id}
            canEdit={canEdit}
            total={communications.total}
            entries={communications.items.map((entry) => ({
              id: entry.id,
              channel: entry.channel,
              direction: entry.direction,
              subject: entry.subject,
              body: entry.body,
              occurredAt: entry.occurredAt.toISOString(),
              occurredAtLabel: formatDateTime(entry.occurredAt, format),
              authorName: entry.createdBy?.name ?? null,
            }))}
          />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentPanel
            endpoint={`/api/customers/${id}/documents`}
            canEdit={canEdit}
            documents={documents.map((document) => ({
              id: document.id,
              name: document.name,
              sizeLabel: formatBytes(document.sizeBytes, format),
              uploadedBy: document.createdBy?.name ?? null,
              uploadedAt: document.createdAt.toISOString(),
              uploadedAtLabel: formatDateTime(document.createdAt, format),
            }))}
          />
        </TabsContent>

        <TabsContent value="quotations">
          {quotations ? (
            <SalesRowsTable
              caption={`Quotations of ${customer.name}`}
              rows={quotations.items.map((quotation) => quotationRow(quotation, sales))}
              empty="No quotations yet"
              create={
                can(ctx, "quotations:create")
                  ? { href: `/sales/quotations/new?customerId=${id}`, label: "New quotation" }
                  : undefined
              }
            />
          ) : null}
        </TabsContent>
        <TabsContent value="invoices">
          {invoices ? (
            <SalesRowsTable
              caption={`Invoices of ${customer.name}`}
              rows={invoices.map((invoice) => invoiceRow(invoice, sales))}
              empty="No invoices yet"
              create={
                can(ctx, "invoices:create")
                  ? { href: `/sales/invoices/new?customerId=${id}`, label: "New invoice" }
                  : undefined
              }
            />
          ) : null}
        </TabsContent>
        <TabsContent value="payments">
          {payments ? (
            <SalesRowsTable
              caption={`Payments of ${customer.name}`}
              rows={payments.map((payment) => paymentRow(payment, sales))}
              empty="No payments yet"
            />
          ) : null}
        </TabsContent>
        <TabsContent value="projects">
          <RelatedUnavailable records="projects" module="projects" />
        </TabsContent>

        <TabsContent value="history">
          <Card className="shadow-xs">
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
        </TabsContent>
      </Tabs>
    </>
  );
}
