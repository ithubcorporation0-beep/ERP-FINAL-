import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PURCHASE_ORDER_STATUS_LABELS, PURCHASE_REQUEST_STATUS_LABELS } from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { PURCHASE_REQUEST_TONES } from "@/features/inventory/labels";
import { quantityLabel } from "@/features/inventory/rows";
import { PurchaseRequestActions } from "@/features/purchasing/workflow-actions";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { purchaseRequestService } from "@/server/services/purchase-request.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Purchase request" };

export default async function PurchaseRequestPage({ params }: PageProps<"/purchasing/requests/[id]">) {
  const ctx = (await authorizePage("purchases:view")) ?? (await authorizePage("purchases:create"));
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const request = await orNotFound(purchaseRequestService.get(ctx, id));
  const [history, company] = await Promise.all([purchaseRequestService.history(ctx, id), salesContext(ctx)]);
  const abilities = purchaseRequestService.abilities(ctx, request);
  const code = formatRecordNumber("purchaseRequest", request.number);

  return (
    <>
      <PageHeader
        title={`Purchase request ${code}`}
        description={request.reason}
        actions={
          <>
            {abilities.order ? (
              <Button asChild>
                <Link href={`/purchasing/orders/new?requestId=${id}`}>
                  <ShoppingCart aria-hidden="true" />
                  Create purchase order
                </Link>
              </Button>
            ) : null}
            <PurchaseRequestActions id={id} code={code} can={abilities} />
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge tone={PURCHASE_REQUEST_TONES[request.status]}>
          {PURCHASE_REQUEST_STATUS_LABELS[request.status]}
        </StatusBadge>
        {abilities.ownPending ? (
          <p className="text-sm text-muted-foreground">Waiting for someone else to approve your request.</p>
        ) : null}
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
                <TableCaption className="sr-only">Requested products</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Estimated unit price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {request.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link href={`/inventory/products/${item.product.id}`} className="hover:underline">
                          {item.product.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {item.product.sku}
                        </span>
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {quantityLabel(item.quantity, item.product.unit)}
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {item.estimatedUnitPrice ? formatMoney(money(item.estimatedUnitPrice), company) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Request ID", value: <span className="font-mono">{code}</span> },
                  { label: "Requested by", value: request.requestedBy?.name },
                  { label: "Requested", value: formatDateTime(request.createdAt, company) },
                  {
                    label: "Needed by",
                    value: request.neededBy ? formatCalendarDate(request.neededBy, company) : null,
                  },
                  { label: "Suggested supplier", value: request.supplier?.name },
                  {
                    label: "Decision",
                    value: request.decidedAt
                      ? `${PURCHASE_REQUEST_STATUS_LABELS[request.status]} by ${request.decidedBy?.name ?? "—"} on ${formatDateTime(request.decidedAt, company)}${request.decisionNote ? ` — ${request.decisionNote}` : ""}`
                      : null,
                  },
                  {
                    label: "Purchase order",
                    value: request.purchaseOrder ? (
                      <Link
                        href={`/purchasing/orders/${request.purchaseOrder.id}`}
                        className="text-primary hover:underline"
                      >
                        {formatRecordNumber("purchaseOrder", request.purchaseOrder.number)} (
                        {PURCHASE_ORDER_STATUS_LABELS[request.purchaseOrder.status]})
                      </Link>
                    ) : null,
                  },
                ]}
              />
            </CardContent>
          </Card>
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
                atLabel: formatDateTime(entry.at, company),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
