import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { ExpenseForm } from "@/features/finance/expense-form";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { expenseService } from "@/server/services/expense.service";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: PageProps<"/finance/expenses/[id]/edit">) {
  const ctx = await authorizePage("expenses:view");
  if (!ctx) return <AccessDenied />;
  const expense = await orNotFound(expenseService.get(ctx, recordIdOrNotFound((await params).id)));
  if (expense.status === "APPROVED") {
    return (
      <EmptyState
        title="This expense can't be edited"
        description="Approved expenses are posted to the accounts and can't change."
      />
    );
  }
  const employees = await expenseService.employees(ctx);

  return (
    <>
      <PageHeader
        title={`Edit ${formatRecordNumber("expense", expense.number)}`}
        description="Saving sends the expense back for approval."
      />
      <Card className="shadow-xs">
        <CardContent>
          <ExpenseForm
            expenseId={expense.id}
            currency={expense.currency}
            employees={employees.map((user) => ({ value: user.id, label: user.name }))}
            defaults={{
              category: expense.category,
              amount: money(expense.amount),
              expenseDate: dateToDateOnly(expense.expenseDate),
              vendor: expense.vendor ?? "",
              paymentMethod: expense.paymentMethod,
              description: expense.description,
              employeeId: expense.employeeId ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
