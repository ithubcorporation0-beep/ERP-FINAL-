import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { STOCK_STATUS_LABELS } from "@/config/inventory";
import { STOCK_STATUS_TONES } from "@/features/inventory/labels";
import { quantityLabel } from "@/features/inventory/rows";
import { authorizePage } from "@/lib/auth/page";
import { formatMoney } from "@/lib/format";
import { money } from "@/lib/money";
import { productService } from "@/server/services/product.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Inventory reports" };

export default async function InventoryReportsPage() {
  const ctx = await authorizePage("products:view");
  if (!ctx) return <AccessDenied />;
  const [valuation, low, format] = await Promise.all([
    productService.valuation(ctx),
    productService.lowStock(ctx),
    salesContext(ctx),
  ]);
  const show = (value: string) => formatMoney(value, format) ?? value;

  return (
    <>
      <PageHeader
        title="Inventory reports"
        description="Stock on hand valued at purchase price, and products that need reordering."
      />
      <div className="space-y-4">
        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle>
              <h2>Low stock ({low.length})</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {low.length === 0 ? (
              <EmptyState
                size="compact"
                title="No low-stock products"
                description="Products with a minimum stock alert here when their stock falls to it."
              />
            ) : (
              <Table>
                <TableCaption className="sr-only">Products at or below minimum stock</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Current stock</TableHead>
                    <TableHead className="text-right">Minimum</TableHead>
                    <TableHead className="text-right">Reorder at least</TableHead>
                    <TableHead>Supplier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {low.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Link
                          href={`/inventory/products/${product.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={STOCK_STATUS_TONES[product.stock.status]}>
                          {STOCK_STATUS_LABELS[product.stock.status]}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {quantityLabel(product.stock.onHand, product.unit)}
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {quantityLabel(product.minimumStock, product.unit)}
                      </TableCell>
                      <TableCell className="text-right font-medium" data-numeric>
                        {quantityLabel(product.stock.shortfall, product.unit)}
                      </TableCell>
                      <TableCell>{product.supplier?.name ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle>
              <h2>Stock valuation</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 overflow-x-auto">
            {valuation.rows.length === 0 ? (
              <EmptyState size="compact" title="No products yet" />
            ) : (
              <Table>
                <TableCaption className="sr-only">Stock valuation at purchase price</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Current stock</TableHead>
                    <TableHead className="text-right">Purchase price</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valuation.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/inventory/products/${row.id}`} className="hover:underline">
                          {row.name}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{row.sku}</span>
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {quantityLabel(row.stock.onHand, row.unit)}
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {show(money(row.purchasePrice))}
                      </TableCell>
                      <TableCell className="text-right" data-numeric>
                        {show(row.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Total stock value</TableCell>
                    <TableCell className="text-right" data-numeric>
                      {show(valuation.total)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
            <p className="text-xs text-muted-foreground">
              Value = current stock × the product&apos;s current purchase price (not a FIFO or average cost).
              Purchases are expensed when billed, so this value isn&apos;t on the balance sheet — see
              docs/inventory.md.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
