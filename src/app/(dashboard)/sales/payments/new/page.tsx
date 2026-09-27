import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentForm } from "@/features/sales/payment-form";
import { authorizePage } from "@/lib/auth/page";
import { formatMoney } from "@/lib/format";
import { money, subtractMoney } from "@/lib/money";
import { idSchema } from "@/lib/validation";
import { invoiceService } from "@/server/services/invoice.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Record payment" };

export default async function NewPaymentPage({ searchParams }: PageProps<"/sales/payments/new">) {
  const ctx = await authorizePage("payments:create");
  if (!ctx) return <AccessDenied />;
  const [invoices, sales] = await Promise.all([invoiceService.listPayable(ctx), salesContext(ctx)]);
  const requested = idSchema.safeParse((await searchParams).invoiceId);
  const options = invoices.map((invoice) => {
    const balance = subtractMoney(money(invoice.total), money(invoice.amountPaid));
    const balanceLabel =
      formatMoney(balance, { locale: sales.locale, currency: invoice.currency }) ?? balance;
    return {
      id: invoice.id,
      label: `${invoice.code} · ${invoice.customer.name} — ${balanceLabel} due`,
      balance,
      balanceLabel,
    };
  });
  const preselected = requested.success ? options.find((option) => option.id === requested.data) : undefined;

  return (
    <>
      <PageHeader title="Record payment" description="The invoice's balance and status update immediately." />
      {options.length === 0 ? (
        <EmptyState
          title="No invoices waiting for payment"
          description="Payments are recorded against sent or partially paid invoices."
        />
      ) : (
        <Card className="shadow-xs">
          <CardContent>
            <PaymentForm
              invoices={options}
              defaults={{
                invoiceId: preselected?.id ?? "",
                amount: preselected?.balance ?? "",
                method: "BANK_TRANSFER",
                reference: "",
                paymentDate: sales.today,
                notes: "",
              }}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
