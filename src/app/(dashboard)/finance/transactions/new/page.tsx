import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TransactionForm } from "@/features/finance/transaction-form";
import { authorizePage } from "@/lib/auth/page";
import { accountingService } from "@/server/services/accounting.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "New transaction" };

export default async function NewTransactionPage() {
  const ctx = await authorizePage("accounting:create");
  if (!ctx) return <AccessDenied />;
  const [accounts, sales] = await Promise.all([accountingService.accounts(ctx), salesContext(ctx)]);

  return (
    <>
      <PageHeader
        title="New transaction"
        description="A manual journal entry. Debits must equal credits; posted entries can't be edited, only reversed."
      />
      <Card className="shadow-xs">
        <CardContent>
          <TransactionForm
            accounts={accounts
              .filter((account) => account.isActive)
              .map((account) => ({ value: account.id, label: `${account.code} ${account.name}` }))}
            today={sales.today}
            locale={sales.locale}
            currency={sales.currency}
          />
        </CardContent>
      </Card>
    </>
  );
}
