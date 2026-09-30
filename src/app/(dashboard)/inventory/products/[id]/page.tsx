import type { Metadata } from "next";
import { ArrowRightLeft, ClipboardList, Pencil } from "lucide-react";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STOCK_MOVEMENT_TYPE_LABELS, STOCK_STATUS_LABELS } from "@/config/inventory";
import { formatRecordNumber } from "@/config/records";
import { DeleteRecordButton } from "@/features/crm/delete-record-button";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { MOVEMENT_TYPE_TONES, STOCK_STATUS_TONES } from "@/features/inventory/labels";
import { quantityLabel } from "@/features/inventory/rows";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { compareQuantity, quantity } from "@/lib/inventory";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { stockMovementListQuerySchema } from "@/lib/validation";
import { deleteProductAction } from "@/server/actions/inventory.actions";
import { productService } from "@/server/services/product.service";
import { salesContext } from "@/server/services/sales-shared";
import { stockService } from "@/server/services/stock.service";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/inventory/products/[id]">) {
  const ctx = await authorizePage("products:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const product = await orNotFound(productService.detail(ctx, id));
  const seesMovements = can(ctx, "inventory:view");
  const [format, history, movements] = await Promise.all([
    salesContext(ctx),
    productService.history(ctx, id),
    seesMovements
      ? stockService.list(ctx, stockMovementListQuerySchema.parse({ productId: id, pageSize: 20 }))
      : null,
  ]);
  const code = formatRecordNumber("product", product.number);
  const unit = product.unit;
  const canMove = product.isActive && (can(ctx, "inventory:create") || can(ctx, "inventory:edit"));

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.sku} · ${code}`}
        actions={
          <>
            {canMove ? (
              <Button asChild>
                <Link href={`/inventory/movements/new?productId=${id}`}>
                  <ArrowRightLeft aria-hidden="true" />
                  Record stock movement
                </Link>
              </Button>
            ) : null}
            {product.stock.low && product.isActive && can(ctx, "purchases:create") ? (
              <Button asChild variant="outline">
                <Link href={`/purchasing/requests/new?productId=${id}`}>
                  <ClipboardList aria-hidden="true" />
                  Request more
                </Link>
              </Button>
            ) : null}
            {can(ctx, "products:edit") ? (
              <Button asChild variant="outline">
                <Link href={`/inventory/products/${id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {can(ctx, "products:delete") ? (
              <DeleteRecordButton
                noun="product"
                name={product.name}
                action={deleteProductAction.bind(null, id)}
                redirectTo="/inventory"
              />
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone={STOCK_STATUS_TONES[product.stock.status]}>
          {STOCK_STATUS_LABELS[product.stock.status]}
        </StatusBadge>
        {product.stock.low ? (
          <StatusBadge tone="warning">
            Low-stock alert: reorder {quantityLabel(product.stock.shortfall, unit)}
          </StatusBadge>
        ) : null}
        {product.isActive ? null : <StatusBadge tone="neutral">Inactive</StatusBadge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Stock</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Current stock", value: quantityLabel(product.stock.onHand, unit) },
                  { label: "Minimum stock", value: quantityLabel(product.minimumStock, unit) },
                  { label: "On order", value: quantityLabel(product.onOrder, unit) },
                  { label: "Stock value", value: formatMoney(product.value, format) ?? product.value },
                ].map((figure) => (
                  <div key={figure.label} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                    <dd className="text-lg font-semibold" data-numeric>
                      {figure.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableCaption className="sr-only">Stock per warehouse</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.warehouses.map((warehouse) => (
                      <TableRow key={warehouse.id}>
                        <TableCell>
                          {warehouse.name}
                          {warehouse.isActive ? "" : " (inactive)"}
                        </TableCell>
                        <TableCell
                          className={
                            compareQuantity(warehouse.onHand, "0") > 0
                              ? "text-right"
                              : "text-right text-muted-foreground"
                          }
                          data-numeric
                        >
                          {quantityLabel(warehouse.onHand, unit)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Stock value = current stock × purchase price. Stock is calculated from the movements below.
              </p>
            </CardContent>
          </Card>

          {movements ? (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Inventory history ({movements.total})</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {movements.items.length === 0 ? (
                  <EmptyState size="compact" title="No stock movements yet" />
                ) : (
                  <div className="space-y-2">
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableCaption className="sr-only">Stock movements of {product.name}</TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Movement</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Warehouse</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead>Reference</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {movements.items.map((movement) => {
                            const qty = quantity(movement.quantity);
                            return (
                              <TableRow key={movement.id}>
                                <TableCell>
                                  <StatusBadge tone={MOVEMENT_TYPE_TONES[movement.type]}>
                                    {STOCK_MOVEMENT_TYPE_LABELS[movement.type]}
                                  </StatusBadge>
                                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                                    {formatRecordNumber("stock", movement.number)}
                                    {movement.createdBy ? ` · ${movement.createdBy.name}` : ""}
                                  </p>
                                </TableCell>
                                <TableCell>{formatCalendarDate(movement.movementDate, format)}</TableCell>
                                <TableCell>{movement.warehouse.name}</TableCell>
                                <TableCell className="text-right whitespace-nowrap" data-numeric>
                                  {compareQuantity(qty, "0") > 0 ? "+" : ""}
                                  {quantityLabel(qty, unit)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {movement.goodsReceipt ? (
                                    <Link
                                      href={`/purchasing/orders/${movement.goodsReceipt.orderId}`}
                                      className="text-primary hover:underline"
                                    >
                                      {movement.reference}
                                    </Link>
                                  ) : (
                                    (movement.reference ?? "")
                                  )}
                                  {movement.note ? (
                                    <p className="text-xs text-muted-foreground">{movement.note}</p>
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    {movements.total > movements.items.length ? (
                      <Link
                        href={`/inventory/movements?productId=${id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        See all {movements.total} movements
                      </Link>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Product ID", value: <span className="font-mono">{code}</span> },
                  { label: "SKU", value: <span className="font-mono">{product.sku}</span> },
                  { label: "Category", value: product.category?.name },
                  { label: "Brand", value: product.brand },
                  { label: "Unit", value: product.unit },
                  { label: "Purchase price", value: formatMoney(money(product.purchasePrice), format) },
                  { label: "Selling price", value: formatMoney(money(product.sellingPrice), format) },
                  {
                    label: "Supplier",
                    value: product.supplier ? (
                      can(ctx, "suppliers:view") ? (
                        <Link
                          className="text-primary hover:underline"
                          href={`/purchasing/suppliers/${product.supplier.id}`}
                        >
                          {product.supplier.name}
                        </Link>
                      ) : (
                        product.supplier.name
                      )
                    ) : null,
                  },
                  { label: "Default warehouse", value: product.warehouse?.name },
                  {
                    label: "Created",
                    value: `${formatDate(product.createdAt, format)}${product.createdBy ? ` by ${product.createdBy.name}` : ""}`,
                  },
                ]}
              />
              {product.description ? (
                <p className="mt-4 text-sm whitespace-pre-wrap">{product.description}</p>
              ) : null}
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
                atLabel: formatDateTime(entry.at, format),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
