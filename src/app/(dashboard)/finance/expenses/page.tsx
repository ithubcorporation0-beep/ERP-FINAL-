import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EXPENSE_STATUS_LABELS, EXPENSE_STATUSES } from "@/config/accounting";
import { expenseRow } from "@/features/finance/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { expenseListQuerySchema } from "@/lib/validation";
import { expenseService } from "@/server/services/expense.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: PageProps<"/finance/expenses">) {
  const ctx = await authorizePage("expenses:view");
  if (!ctx) return <AccessDenied />;
  const query = expenseListQuerySchema.catch(expenseListQuerySchema.parse({})).parse(await searchParams);
  const [result, sales] = await Promise.all([expenseService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "expenses:create");

  return (
    <>
      <PageHeader
        title="Expenses"
        description={
          expenseService.seesAll(ctx)
            ? "Money the company spends. Approved expenses are posted to the accounts."
            : "Your expense claims and their approval status."
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/finance/expenses/new">
                <Plus aria-hidden="true" />
                New expense
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((expense) => expenseRow(expense, sales))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Expenses",
          searchLabel: "Search expenses",
          searchPlaceholder: "Search number, vendor or description…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: EXPENSE_STATUSES.map((status) => ({
            value: status,
            label: EXPENSE_STATUS_LABELS[status],
          })),
          columns: {
            code: "Expense",
            reference: "Vendor",
            party: "Employee",
            date: "Date",
            secondary: "Category",
            amount: "Amount",
          },
          empty: {
            icon: "expense",
            title: "No expenses yet",
            description: "Submit an expense with its receipt; an approver reviews it.",
            ...(canCreate ? { createHref: "/finance/expenses/new", createLabel: "New expense" } : {}),
          },
        }}
      />
    </>
  );
}
