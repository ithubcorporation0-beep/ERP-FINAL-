import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES } from "@/config/accounting";
import { journalRow } from "@/features/finance/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { journalListQuerySchema } from "@/lib/validation";
import { accountingService } from "@/server/services/accounting.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/finance/transactions">) {
  const ctx = await authorizePage("accounting:view");
  if (!ctx) return <AccessDenied />;
  const query = journalListQuerySchema.catch(journalListQuerySchema.parse({})).parse(await searchParams);
  const [result, sales] = await Promise.all([accountingService.transactions(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "accounting:create");

  return (
    <>
      <PageHeader
        title="Transactions"
        description="The journal: every posting to the accounts, automatic (invoices, payments, expenses) or manual."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/finance/transactions/new">
                <Plus aria-hidden="true" />
                New transaction
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((entry) => journalRow(entry, sales))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Transactions",
          searchLabel: "Search transactions",
          searchPlaceholder: "Search number, description or reference…",
          filterKey: "type",
          filterLabel: "Types",
          filterOptions: TRANSACTION_TYPES.map((type) => ({
            value: type,
            label: TRANSACTION_TYPE_LABELS[type],
          })),
          columns: {
            code: "Transaction",
            reference: "Reference",
            party: "Description",
            date: "Date",
            secondary: "Type",
            amount: "Amount",
          },
          empty: {
            icon: "journal",
            title: "No transactions yet",
            description: "Issued invoices, payments and approved expenses are posted here automatically.",
            ...(canCreate ? { createHref: "/finance/transactions/new", createLabel: "New transaction" } : {}),
          },
        }}
      />
    </>
  );
}
