import type { Metadata } from "next";
import { Pencil, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STOCK_STATUS_LABELS } from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { DeleteRecordButton } from "@/features/crm/delete-record-button";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { STOCK_STATUS_TONES } from "@/features/inventory/labels";
import { billRow, orderRow, quantityLabel, supplierPaymentRow } from "@/features/inventory/rows";
import { SalesRowsTable } from "@/features/sales/sales-rows-table";
import { authorizePage } from "@/lib/auth/page";
import { formatDate, formatDateTime } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { deleteSupplierAction } from "@/server/actions/purchasing.actions";
import { salesContext } from "@/server/services/sales-shared";
import { supplierService } from "@/server/services/supplier.service";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: PageProps<"/purchasing/suppliers/[id]">) {
  const ctx = await authorizePage("suppliers:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const supplier = await orNotFound(supplierService.get(ctx, id));
  const [related, history, company] = await Promise.all([
    supplierService.related(ctx, id),
    supplierService.history(ctx, id),
    salesContext(ctx),
  ]);
  const code = formatRecordNumber("supplier", supplier.number);

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={[code, supplier.companyName].filter(Boolean).join(" · ")}
        actions={
          <>
            {supplier.isActive && can(ctx, "purchases:create") ? (
              <Button asChild>
                <Link href={`/purchasing/orders/new?supplierId=${id}`}>
                  <ShoppingCart aria-hidden="true" />
                  New purchase order
                </Link>
              </Button>
            ) : null}
            {can(ctx, "suppliers:edit") ? (
              <Button asChild variant="outline">
                <Link href={`/purchasing/suppliers/${id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {can(ctx, "suppliers:delete") ? (
              <DeleteRecordButton
                noun="supplier"
                name={supplier.name}
                action={deleteSupplierAction.bind(null, id)}
                redirectTo="/purchasing/suppliers"
              />
            ) : null}
          </>
        }
      />
      {supplier.isActive ? null : (
        <div className="mb-4">
          <StatusBadge tone="neutral">Inactive</StatusBadge>
        </div>
      )}
      <Tabs defaultValue="overview">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {related.products ? (
              <TabsTrigger value="products">Products ({related.products.length})</TabsTrigger>
            ) : null}
            {related.orders ? (
              <TabsTrigger value="orders">Purchase history ({related.orders.length})</TabsTrigger>
            ) : null}
            {related.invoices ? (
              <TabsTrigger value="bills">Invoices ({related.invoices.length})</TabsTrigger>
            ) : null}
            {related.payments ? (
              <TabsTrigger value="payments">Payment history ({related.payments.length})</TabsTrigger>
            ) : null}
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Supplier ID", value: <span className="font-mono">{code}</span> },
                  { label: "Name", value: supplier.name },
                  { label: "Company", value: supplier.companyName },
                  {
                    label: "Phone",
                    value: supplier.phone ? (
                      <a
                        className="text-primary hover:underline"
                        href={`tel:${supplier.phone.replace(/\s/g, "")}`}
                      >
                        {supplier.phone}
                      </a>
                    ) : null,
                  },
                  {
                    label: "Email",
                    value: supplier.email ? (
                      <a className="text-primary hover:underline" href={`mailto:${supplier.email}`}>
                        {supplier.email}
                      </a>
                    ) : null,
                  },
                  { label: "Address", value: supplier.address },
                  { label: "Tax information", value: supplier.taxId },
                  {
                    label: "Created",
                    value: `${formatDate(supplier.createdAt, company)}${supplier.createdBy ? ` by ${supplier.createdBy.name}` : ""}`,
                  },
                ]}
              />
              {supplier.notes ? <p className="mt-4 text-sm whitespace-pre-wrap">{supplier.notes}</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        {related.products ? (
          <TabsContent value="products">
            {related.products.length === 0 ? (
              <EmptyState size="compact" title="No products from this supplier yet" />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableCaption className="sr-only">Products of {supplier.name}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Current stock</TableHead>
                      <TableHead>Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {related.products.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Link
                            href={`/inventory/products/${product.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {product.name}
                          </Link>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{product.sku}</span>
                        </TableCell>
                        <TableCell className="text-right" data-numeric>
                          {quantityLabel(product.stock.onHand, product.unit)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={STOCK_STATUS_TONES[product.stock.status]}>
                            {STOCK_STATUS_LABELS[product.stock.status]}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ) : null}

        {related.orders ? (
          <TabsContent value="orders">
            <SalesRowsTable
              caption={`Purchase orders of ${supplier.name}`}
              rows={related.orders.map((order) => orderRow(order, company))}
              empty="No purchase orders yet"
            />
          </TabsContent>
        ) : null}
        {related.invoices ? (
          <TabsContent value="bills">
            <SalesRowsTable
              caption={`Invoices of ${supplier.name}`}
              rows={related.invoices.map((bill) => billRow(bill, company))}
              empty="No supplier invoices yet"
            />
          </TabsContent>
        ) : null}
        {related.payments ? (
          <TabsContent value="payments">
            <SalesRowsTable
              caption={`Payments to ${supplier.name}`}
              rows={related.payments.map((payment) => supplierPaymentRow(payment, company))}
              empty="No payments yet"
            />
          </TabsContent>
        ) : null}

        <TabsContent value="history">
          <Card className="shadow-xs">
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
        </TabsContent>
      </Tabs>
    </>
  );
}
