import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { emptyBill } from "@/features/purchasing/defaults";
import { BillForm } from "@/features/purchasing/bill-form";
import { authorizePage } from "@/lib/auth/page";
import { compareMoney, money, subtractMoney } from "@/lib/money";
import { can } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";
import { purchaseOrderService } from "@/server/services/purchase-order.service";
import { salesContext } from "@/server/services/sales-shared";
import { supplierService } from "@/server/services/supplier.service";

export const metadata: Metadata = { title: "Record supplier invoice" };

export default async function NewSupplierInvoicePage({ searchParams }: PageProps<"/purchasing/bills/new">) {
  const ctx = await authorizePage("accounting:create");
  if (!ctx || !can(ctx, "purchases:view")) return <AccessDenied />;
  const [suppliers, orders, company] = await Promise.all([
    supplierService.options(ctx),
    purchaseOrderService.billable(ctx),
    salesContext(ctx),
  ]);
  const orderId = idSchema.safeParse((await searchParams).orderId).data;
  const order = orders.find((candidate) => candidate.id === orderId);
  const detail = order ? await purchaseOrderService.detail(ctx, order.id) : null;
  const left = detail ? subtractMoney(money(detail.total), detail.billed) : null;
  const defaults = emptyBill(company.today);

  return (
    <>
      <PageHeader
        title="Record supplier invoice"
        description="A Bill ID is assigned automatically. Saving posts the bill to Accounts Payable (Dr Purchases, Cr Accounts Payable)."
      />
      <Card className="shadow-xs">
        <CardContent>
          {suppliers.length === 0 ? (
            <EmptyState size="compact" title="No active suppliers" description="Add the supplier first." />
          ) : (
            <BillForm
              locale={company.locale}
              currency={company.currency}
              suppliers={suppliers}
              orders={orders.map((candidate) => ({
                value: candidate.id,
                label: `${formatRecordNumber("purchaseOrder", candidate.number)} · ${candidate.supplier.name}`,
                supplierId: candidate.supplierId,
              }))}
              defaults={
                order
                  ? {
                      ...defaults,
                      supplierId: order.supplierId,
                      orderId: order.id,
                      subtotal: left && compareMoney(left, "0.00") > 0 ? left : "",
                    }
                  : defaults
              }
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
