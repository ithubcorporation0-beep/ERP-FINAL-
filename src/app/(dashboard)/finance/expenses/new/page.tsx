import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { emptyExpense } from "@/features/finance/defaults";
import { ExpenseForm } from "@/features/finance/expense-form";
import { authorizePage } from "@/lib/auth/page";
import { expenseService } from "@/server/services/expense.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "New expense" };

export default async function NewExpensePage() {
  const ctx = await authorizePage("expenses:create");
  if (!ctx) return <AccessDenied />;
  const [employees, sales] = await Promise.all([expenseService.employees(ctx), salesContext(ctx)]);

  return (
    <>
      <PageHeader
        title="New expense"
        description="It starts as pending; an approver approves or rejects it."
      />
      <Card className="shadow-xs">
        <CardContent>
          <ExpenseForm
            defaults={emptyExpense(sales.today)}
            employees={employees.map((user) => ({ value: user.id, label: user.name }))}
            currency={sales.currency}
          />
        </CardContent>
      </Card>
    </>
  );
}
