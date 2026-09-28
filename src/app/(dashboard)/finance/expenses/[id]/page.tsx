import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "@/config/accounting";
import { formatRecordNumber } from "@/config/records";
import { HistoryList } from "@/features/crm/history-list";
import { ExpenseActions } from "@/features/finance/expense-actions";
import { EXPENSE_STATUS_TONES } from "@/features/finance/labels";
import { isUnpaid } from "@/lib/accounting";
import { authorizePage } from "@/lib/auth/page";
import { formatBytes, formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { accountingService } from "@/server/services/accounting.service";
import { expenseService } from "@/server/services/expense.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Expense" };

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

export default async function ExpensePage({ params }: PageProps<"/finance/expenses/[id]">) {
  const ctx = await authorizePage("expenses:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const expense = await orNotFound(expenseService.get(ctx, id));
  const canSeeLedger = can(ctx, "accounting:view");
  const [history, sales, entries] = await Promise.all([
    expenseService.history(ctx, id),
    salesContext(ctx),
    canSeeLedger ? accountingService.entriesForSource(ctx, "EXPENSE", id) : Promise.resolve([]),
  ]);
  const code = formatRecordNumber("expense", expense.number);
  const format = { locale: sales.locale, timeZone: sales.timeZone, currency: expense.currency };
  const unpaid = isUnpaid(expense);

  return (
    <>
      <PageHeader
        title={`Expense ${code}`}
        description={`${EXPENSE_CATEGORY_LABELS[expense.category]}${expense.vendor ? ` · ${expense.vendor}` : ""}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge tone={EXPENSE_STATUS_TONES[expense.status]}>
          {EXPENSE_STATUS_LABELS[expense.status]}
        </StatusBadge>
        {unpaid ? <StatusBadge tone="warning">Unpaid — owed to the vendor</StatusBadge> : null}
        {expense.paidAt ? (
          <span className="text-sm">
            Paid on {formatCalendarDate(expense.paidAt, sales)}
            {expense.paidMethod ? ` by ${EXPENSE_PAYMENT_METHOD_LABELS[expense.paidMethod]}` : ""}
          </span>
        ) : null}
      </div>
      <div className="mb-6">
        <ExpenseActions
          id={id}
          code={code}
          status={expense.status}
          unpaid={unpaid}
          hasReceipt={expense.receiptKey !== null}
          today={sales.today}
          can={expenseService.abilities(ctx, expense)}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Amount">
                  <span data-numeric>{formatMoney(money(expense.amount), format)}</span>
                </Detail>
                <Detail label="Date">{formatCalendarDate(expense.expenseDate, sales)}</Detail>
                <Detail label="Category">{EXPENSE_CATEGORY_LABELS[expense.category]}</Detail>
                <Detail label="Payment method">{EXPENSE_PAYMENT_METHOD_LABELS[expense.paymentMethod]}</Detail>
                <Detail label="Vendor">{expense.vendor ?? "—"}</Detail>
                <Detail label="Employee">{expense.employee?.name ?? "—"}</Detail>
                <Detail label="Receipt">
                  {expense.receiptName ? (
                    <a href={`/api/expenses/${id}/receipt`} className="text-primary hover:underline" download>
                      {expense.receiptName}
                      {expense.receiptSize ? ` (${formatBytes(expense.receiptSize, format)})` : ""}
                    </a>
                  ) : (
                    "No receipt attached"
                  )}
                </Detail>
                <Detail label="Submitted by">{expense.createdBy?.name ?? "—"}</Detail>
                <div className="sm:col-span-2">
                  <dt className="text-sm text-muted-foreground">Description</dt>
                  <dd className="whitespace-pre-line">{expense.description}</dd>
                </div>
                {expense.decidedAt ? (
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-muted-foreground">
                      {expense.status === "REJECTED" ? "Rejected" : "Approved"} by{" "}
                      {expense.decidedBy?.name ?? "—"} on {formatDateTime(expense.decidedAt, format)}
                    </dt>
                    <dd className="whitespace-pre-line">{expense.decisionNote ?? "No note."}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
          {canSeeLedger ? (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Accounting</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nothing posted yet. The expense is posted to the accounts when it is approved.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {entries.map((entry) => (
                      <li key={entry.id}>
                        <Link
                          href={`/finance/transactions/${entry.id}`}
                          className="font-mono text-primary hover:underline"
                        >
                          {formatRecordNumber("journal", entry.number)}
                        </Link>{" "}
                        · {TRANSACTION_TYPE_LABELS[entry.type]} · {formatCalendarDate(entry.entryDate, sales)}{" "}
                        · {entry.description}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
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
