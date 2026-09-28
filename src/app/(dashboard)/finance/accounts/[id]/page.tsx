import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { ACCOUNT_TYPE_LABELS, NORMAL_SIDE, TRANSACTION_TYPE_LABELS } from "@/config/accounting";
import { formatRecordNumber } from "@/config/records";
import { RangeFilter } from "@/features/dashboard/range-filter";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatMoney } from "@/lib/format";
import { compareMoney } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { reportQuerySchema } from "@/lib/validation";
import { accountingService } from "@/server/services/accounting.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Account ledger" };

export default async function AccountLedgerPage({
  params,
  searchParams,
}: PageProps<"/finance/accounts/[id]">) {
  const ctx = await authorizePage("accounting:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const { range } = reportQuerySchema.parse(await searchParams);
  const [ledger, sales] = await Promise.all([
    orNotFound(accountingService.ledger(ctx, id, range)),
    salesContext(ctx),
  ]);
  const format = { locale: sales.locale, currency: sales.currency };
  const { account } = ledger;
  const show = (value: string) => (compareMoney(value, "0.00") === 0 ? "" : formatMoney(value, format));

  return (
    <>
      <PageHeader
        title={`${account.code} ${account.name}`}
        description={`${ACCOUNT_TYPE_LABELS[account.type]} account — balance shown on its normal (${NORMAL_SIDE[account.type]}) side.`}
        actions={<RangeFilter value={range} />}
      />
      <p className="mb-4 text-sm">
        <Link href="/finance/accounts" className="text-primary hover:underline">
          ← Chart of accounts
        </Link>
      </p>
      <Card className="shadow-xs">
        <CardContent>
          {ledger.rows.length === 0 ? (
            <EmptyState
              size="compact"
              title="No transactions in this period"
              description={`Opening balance: ${formatMoney(ledger.openingBalance, format)}. Choose another period to see more.`}
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Transactions of {account.name}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={5} className="font-medium">
                    Opening balance
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap" data-numeric>
                    {formatMoney(ledger.openingBalance, format)}
                  </TableCell>
                </TableRow>
                {ledger.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatCalendarDate(row.entry.entryDate, sales)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/finance/transactions/${row.entry.id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {formatRecordNumber("journal", row.entry.number)}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {TRANSACTION_TYPE_LABELS[row.entry.type]}
                      </span>
                    </TableCell>
                    <TableCell>{row.description ?? row.entry.description}</TableCell>
                    <TableCell className="text-right whitespace-nowrap" data-numeric>
                      {show(row.debit)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap" data-numeric>
                      {show(row.credit)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap" data-numeric>
                      {formatMoney(row.balance, format)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5}>Closing balance</TableCell>
                  <TableCell className="text-right whitespace-nowrap" data-numeric>
                    {formatMoney(ledger.closingBalance, format)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
          {ledger.truncated ? (
            <p className="mt-3 text-sm text-warning" role="status">
              Only the first 2,000 lines are shown. Choose a shorter period.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
