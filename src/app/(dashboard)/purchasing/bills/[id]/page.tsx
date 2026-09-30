import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPLIER_INVOICE_STATUS_LABELS } from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { PAYMENT_METHOD_LABELS } from "@/config/sales";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { SUPPLIER_INVOICE_TONES } from "@/features/inventory/labels";
import { PayBillDialog } from "@/features/purchasing/pay-bill-dialog";
import { CancelBillButton, VoidSupplierPaymentButton } from "@/features/purchasing/workflow-actions";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { accountingService } from "@/server/services/accounting.service";
import { salesContext } from "@/server/services/sales-shared";
import { billBalance, supplierInvoiceService } from "@/server/services/supplier-invoice.service";

export const metadata: Metadata = { title: "Supplier invoice" };

export default async function SupplierInvoicePage({ params }: PageProps<"/purchasing/bills/[id]">) {
  const ctx = await authorizePage("purchases:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const bill = await orNotFound(supplierInvoiceService.get(ctx, id));
  const seesLedger = can(ctx, "accounting:view");
  // The bill's posting and those of its payments (and their reversals).
  const [history, company, entries] = await Promise.all([
    supplierInvoiceService.history(ctx, id),
    salesContext(ctx),
    seesLedger
      ? Promise.all([
          accountingService.entriesForSource(ctx, "SUPPLIER_INVOICE", id),
          ...bill.payments.map((payment) =>
            accountingService.entriesForSource(ctx, "SUPPLIER_PAYMENT", payment.id),
          ),
        ]).then((groups) => groups.flat())
      : Promise.resolve([]),
  ]);
  const abilities = supplierInvoiceService.abilities(ctx, bill);
  const code = formatRecordNumber("supplierInvoice", bill.number);
  const show = (value: string) =>
    formatMoney(value, { locale: company.locale, currency: bill.currency }) ?? value;
  const balance = billBalance(bill);

  return (
    <>
      <PageHeader
        title={`Supplier invoice ${code}`}
        description={[bill.supplier.name, bill.supplierReference].filter(Boolean).join(" · ")}
        actions={
          <>
            {abilities.pay ? (
              <PayBillDialog
                invoiceId={id}
                code={code}
                balance={balance}
                balanceLabel={show(balance)}
                today={company.today}
                currency={bill.currency}
              />
            ) : null}
            {abilities.cancel ? <CancelBillButton id={id} code={code} /> : null}
          </>
        }
      />
      <div className="mb-4">
        <StatusBadge tone={SUPPLIER_INVOICE_TONES[bill.status]}>
          {SUPPLIER_INVOICE_STATUS_LABELS[bill.status]}
        </StatusBadge>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Amounts</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Before tax", value: show(money(bill.subtotal)) },
                  { label: "Tax", value: show(money(bill.taxAmount)) },
                  { label: "Total", value: show(money(bill.total)) },
                  { label: "Balance", value: bill.status === "CANCELLED" ? "—" : show(balance) },
                ].map((figure) => (
                  <div key={figure.label} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                    <dd className="text-lg font-semibold" data-numeric>
                      {figure.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Payments ({bill.payments.length})</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bill.payments.length === 0 ? (
                <EmptyState size="compact" title="No payments yet" />
              ) : (
                <ul className="divide-y rounded-lg border" aria-label="Payments">
                  {bill.payments.map((payment) => {
                    const paymentCode = formatRecordNumber("supplierPayment", payment.number);
                    return (
                      <li
                        key={payment.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                      >
                        <div>
                          <p className={payment.voidedAt ? "font-medium line-through" : "font-medium"}>
                            <span className="font-mono">{paymentCode}</span> · {show(money(payment.amount))} ·{" "}
                            {PAYMENT_METHOD_LABELS[payment.method]}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCalendarDate(payment.paymentDate, company)}
                            {payment.reference ? ` · ${payment.reference}` : ""}
                            {payment.createdBy ? ` · ${payment.createdBy.name}` : ""}
                          </p>
                          {payment.voidedAt ? (
                            <p className="text-xs font-medium text-danger">
                              Voided{payment.voidReason ? `: ${payment.voidReason}` : ""}
                            </p>
                          ) : null}
                        </div>
                        {!payment.voidedAt && abilities.voidPayments ? (
                          <VoidSupplierPaymentButton id={payment.id} code={paymentCode} />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          {seesLedger ? (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Accounting</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No journal entries.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {entries.map((entry) => (
                      <li key={entry.id}>
                        <Link
                          href={`/finance/transactions/${entry.id}`}
                          className="text-primary hover:underline"
                        >
                          {formatRecordNumber("journal", entry.number)}
                        </Link>{" "}
                        — {entry.description}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Bill ID", value: <span className="font-mono">{code}</span> },
                  {
                    label: "Supplier",
                    value: (
                      <Link
                        href={`/purchasing/suppliers/${bill.supplier.id}`}
                        className="text-primary hover:underline"
                      >
                        {bill.supplier.name}
                      </Link>
                    ),
                  },
                  { label: "Supplier's number", value: bill.supplierReference },
                  {
                    label: "Purchase order",
                    value: bill.order ? (
                      <Link
                        href={`/purchasing/orders/${bill.order.id}`}
                        className="text-primary hover:underline"
                      >
                        {formatRecordNumber("purchaseOrder", bill.order.number)}
                      </Link>
                    ) : null,
                  },
                  { label: "Invoice date", value: formatCalendarDate(bill.invoiceDate, company) },
                  {
                    label: "Due date",
                    value: bill.dueDate ? formatCalendarDate(bill.dueDate, company) : null,
                  },
                  {
                    label: "Cancelled",
                    value: bill.cancelledAt
                      ? `${formatDateTime(bill.cancelledAt, company)}${bill.cancelReason ? ` — ${bill.cancelReason}` : ""}`
                      : null,
                  },
                  {
                    label: "Recorded",
                    value: `${formatDate(bill.createdAt, company)}${bill.createdBy ? ` by ${bill.createdBy.name}` : ""}`,
                  },
                ]}
              />
              {bill.notes ? <p className="mt-4 text-sm whitespace-pre-wrap">{bill.notes}</p> : null}
            </CardContent>
          </Card>
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
                  atLabel: formatDateTime(entry.at, company),
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
