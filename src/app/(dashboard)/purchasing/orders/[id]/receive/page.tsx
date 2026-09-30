import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { ReceiveForm } from "@/features/purchasing/receive-form";
import { authorizePage } from "@/lib/auth/page";
import { compareQuantity, trimQuantity } from "@/lib/inventory";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { purchaseOrderService } from "@/server/services/purchase-order.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Receive goods" };

export default async function ReceiveGoodsPage({ params }: PageProps<"/purchasing/orders/[id]/receive">) {
  const ctx = await authorizePage("inventory:create");
  if (!ctx) return <AccessDenied />;
  const order = await orNotFound(purchaseOrderService.detail(ctx, recordIdOrNotFound((await params).id)));
  const code = formatRecordNumber("purchaseOrder", order.number);
  if (!purchaseOrderService.abilities(ctx, order).receive) {
    return (
      <AccessDenied message="Goods can only be received for placed orders that aren't fully received yet." />
    );
  }
  const { today } = await salesContext(ctx);
  const open = order.lines.filter((line) => compareQuantity(line.remaining, "0") > 0);

  return (
    <>
      <PageHeader
        title={`Receive goods for ${code}`}
        description={`From ${order.supplier.name} into ${order.warehouse.name}. Each quantity is added to stock as a "goods received" movement.`}
      />
      <Card className="shadow-xs">
        <CardContent>
          <ReceiveForm
            orderId={order.id}
            today={today}
            warehouse={order.warehouse.name}
            lines={open.map((line) => ({
              orderItemId: line.id,
              product: line.product.name,
              sku: line.product.sku,
              unit: line.product.unit,
              ordered: trimQuantity(line.ordered),
              received: trimQuantity(line.received),
              remaining: trimQuantity(line.remaining),
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
