import type { Metadata } from "next";
import { FileSpreadsheet, PackageCheck, Pencil } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PURCHASE_ORDER_STATUS_LABELS, SUPPLIER_INVOICE_STATUS_LABELS } from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { PURCHASE_ORDER_TONES, SUPPLIER_INVOICE_TONES } from "@/features/inventory/labels";
import { quantityLabel } from "@/features/inventory/rows";
import { CancelOrderButton, PlaceOrderButton } from "@/features/purchasing/workflow-actions";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { compareQuantity } from "@/lib/inventory";
import { money, subtractMoney } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { purchaseOrderService } from "@/server/services/purchase-order.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: PageProps<"/purchasing/orders/[id]">) {
  const ctx = await authorizePage("purchases:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const order = await orNotFound(purchaseOrderService.detail(ctx, id));
  const [history, company] = await Promise.all([purchaseOrderService.history(ctx, id), salesContext(ctx)]);
  const abilities = purchaseOrderService.abilities(ctx, order);
  const code = formatRecordNumber("purchaseOrder", order.number);
  const show = (value: string) =>
    formatMoney(value, { locale: company.locale, currency: order.currency }) ?? value;
  const leftToBill = subtractMoney(money(order.total), order.billed);

  return (
    <>
      <PageHeader
        title={`Purchase order ${code}`}
        description={`${order.supplier.name} · receive into ${order.warehouse.name}`}
        actions={
          <>
            {abilities.order ? <PlaceOrderButton id={id} code={code} /> : null}
            {abilities.receive ? (
              <Button asChild>
                <Link href={`/purchasing/orders/${id}/receive`}>
                  <PackageCheck aria-hidden="true" />
                  Receive goods
                </Link>
              </Button>
            ) : null}
            {abilities.bill && compareQuantity(leftToBill, "0") > 0 ? (
              <Button asChild variant="outline">
                <Link href={`/purchasing/bills/new?orderId=${id}`}>
                  <FileSpreadsheet aria-hidden="true" />
                  Record supplier invoice
                </Link>
              </Button>
            ) : null}
            {abilities.edit ? (
              <Button asChild variant="outline">
                <Link href={`/purchasing/orders/${id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {abilities.cancel ? <CancelOrderButton id={id} code={code} /> : null}
          </>
        }
      />
      <div className="mb-4">
        <StatusBadge tone={PURCHASE_ORDER_TONES[order.status]}>
          {PURCHASE_ORDER_STATUS_LABELS[order.status]}
        </StatusBadge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Products</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableCaption className="sr-only">Order lines with received quantities</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Link href={`/inventory/products/${line.product.id}`} className="hover:underline">
                          {line.product.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {line.product.sku}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {quantityLabel(line.ordered, line.product.unit)}
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {quantityLabel(line.received, line.product.unit)}
                        {compareQuantity(line.remaining, "0") > 0 &&
                        order.status !== "DRAFT" &&
                        order.status !== "CANCELLED" ? (
                          <p className="text-xs text-muted-foreground">
                            {quantityLabel(line.remaining, line.product.unit)} open
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {show(money(line.unitPrice))}
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {show(money(line.lineTotal))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4}>Total</TableCell>
                    <TableCell className="text-right" data-numeric>
                      {show(money(order.total))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Goods received ({order.receipts.length})</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.receipts.length === 0 ? (
                <EmptyState size="compact" title="Nothing received yet" />
              ) : (
                <ul className="divide-y rounded-lg border" aria-label="Goods receipts">
                  {order.receipts.map((receipt) => (
                    <li key={receipt.id} className="p-3 text-sm">
                      <p className="font-medium">
                        <span className="font-mono">
                          {formatRecordNumber("goodsReceipt", receipt.number)}
                        </span>{" "}
                        · {formatCalendarDate(receipt.receivedDate, company)} · {receipt.warehouse.name}
                        {receipt.createdBy ? ` · ${receipt.createdBy.name}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        {receipt.items
                          .map(
                            (item) =>
                              `${quantityLabel(item.quantity, item.product.unit)} ${item.product.name}`,
                          )
                          .join(", ")}
                      </p>
                      {receipt.note ? <p className="text-xs text-muted-foreground">{receipt.note}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Supplier invoices</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.invoices.length === 0 ? (
                <EmptyState size="compact" title="No invoice recorded yet" />
              ) : (
                <ul className="space-y-2">
                  {order.invoices.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/purchasing/bills/${invoice.id}`} className="text-primary hover:underline">
                        {formatRecordNumber("supplierInvoice", invoice.number)} · {show(money(invoice.total))}
                      </Link>
                      <StatusBadge tone={SUPPLIER_INVOICE_TONES[invoice.status]}>
                        {SUPPLIER_INVOICE_STATUS_LABELS[invoice.status]}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Billed (before tax) {show(order.billed)} of {show(money(order.total))}.
              </p>
            </CardContent>
          </Card>
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
                  { label: "Order ID", value: <span className="font-mono">{code}</span> },
                  {
                    label: "Supplier",
                    value: (
                      <Link
                        href={`/purchasing/suppliers/${order.supplier.id}`}
                        className="text-primary hover:underline"
                      >
                        {order.supplier.name}
                      </Link>
                    ),
                  },
                  { label: "Warehouse", value: order.warehouse.name },
                  { label: "Order date", value: formatCalendarDate(order.orderDate, company) },
                  {
                    label: "Expected delivery",
                    value: order.expectedDate ? formatCalendarDate(order.expectedDate, company) : null,
                  },
                  {
                    label: "Purchase request",
                    value: order.request ? (
                      can(ctx, "purchases:view") ? (
                        <Link
                          href={`/purchasing/requests/${order.request.id}`}
                          className="text-primary hover:underline"
                        >
                          {formatRecordNumber("purchaseRequest", order.request.number)}
                        </Link>
                      ) : (
                        formatRecordNumber("purchaseRequest", order.request.number)
                      )
                    ) : null,
                  },
                  {
                    label: "Placed",
                    value: order.orderedAt ? formatDateTime(order.orderedAt, company) : null,
                  },
                  {
                    label: "Cancelled",
                    value: order.cancelledAt
                      ? `${formatDateTime(order.cancelledAt, company)}${order.cancelReason ? ` — ${order.cancelReason}` : ""}`
                      : null,
                  },
                  {
                    label: "Created",
                    value: `${formatDate(order.createdAt, company)}${order.createdBy ? ` by ${order.createdBy.name}` : ""}`,
                  },
                ]}
              />
              {order.notes ? <p className="mt-4 text-sm whitespace-pre-wrap">{order.notes}</p> : null}
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
