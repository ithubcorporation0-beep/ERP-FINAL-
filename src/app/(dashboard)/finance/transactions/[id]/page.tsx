import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
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
import { TRANSACTION_TYPE_LABELS } from "@/config/accounting";
import { formatRecordNumber } from "@/config/records";
import { journalRow } from "@/features/finance/rows";
import { ReverseTransactionButton } from "@/features/finance/reverse-button";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDateTime, formatMoney } from "@/lib/format";
import { compareMoney, money, sumMoney } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { accountingService } from "@/server/services/accounting.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Transaction" };

const SOURCE_LINKS: Record<string, (id: string) => string> = {
  INVOICE: (id) => `/sales/invoices/${id}`,
  EXPENSE: (id) => `/finance/expenses/${id}`,
  PAYROLL: (id) => `/payroll/runs/${id}`,
};

export default async function TransactionPage({ params }: PageProps<"/finance/transactions/[id]">) {
  const ctx = await authorizePage("accounting:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const [entry, sales] = await Promise.all([
    orNotFound(accountingService.transaction(ctx, id)),
    salesContext(ctx),
  ]);
  const code = formatRecordNumber("journal", entry.number);
  const format = { locale: sales.locale, timeZone: sales.timeZone, currency: sales.currency };
  const status = journalRow(entry, sales).status;
  const debits = sumMoney(entry.lines.map((line) => money(line.debit)));
  const credits = sumMoney(entry.lines.map((line) => money(line.credit)));
  const show = (value: string) => (compareMoney(value, "0.00") === 0 ? "" : formatMoney(value, format));
  const sourceLink = entry.sourceId ? SOURCE_LINKS[entry.sourceType]?.(entry.sourceId) : undefined;
  const reversible = entry.sourceType === "MANUAL" && !entry.reversalOfId && entry.reversals.length === 0;

  return (
    <>
      <PageHeader
        title={`Transaction ${code}`}
        description={entry.description}
        actions={
          reversible && can(ctx, "accounting:delete") ? (
            <ReverseTransactionButton id={id} code={code} />
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        <span>{TRANSACTION_TYPE_LABELS[entry.type]}</span>
        <span>· {formatCalendarDate(entry.entryDate, sales)}</span>
        {entry.reference ? <span>· Ref. {entry.reference}</span> : null}
        {sourceLink ? (
          <Link href={sourceLink} className="text-primary hover:underline">
            Open source record
          </Link>
        ) : null}
        {entry.reversalOfId ? (
          <Link href={`/finance/transactions/${entry.reversalOfId}`} className="text-primary hover:underline">
            Reverses the original transaction
          </Link>
        ) : null}
        {entry.reversals.map((reversal) => (
          <Link
            key={reversal.id}
            href={`/finance/transactions/${reversal.id}`}
            className="text-primary hover:underline"
          >
            Reversed by {formatRecordNumber("journal", reversal.number)}
          </Link>
        ))}
      </div>
      <Card className="shadow-xs">
        <CardContent>
          <Table>
            <TableCaption className="sr-only">Lines of {code}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Link href={`/finance/accounts/${line.account.id}`} className="hover:underline">
                      <span className="font-mono text-xs">{line.account.code}</span> {line.account.name}
                    </Link>
                  </TableCell>
                  <TableCell>{line.description ?? ""}</TableCell>
                  <TableCell className="text-right whitespace-nowrap" data-numeric>
                    {show(money(line.debit))}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap" data-numeric>
                    {show(money(line.credit))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Totals</TableCell>
                <TableCell className="text-right whitespace-nowrap" data-numeric>
                  {formatMoney(debits, format)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap" data-numeric>
                  {formatMoney(credits, format)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Posted {formatDateTime(entry.createdAt, format)}
            {entry.createdBy ? ` by ${entry.createdBy.name}` : " automatically"}. Posted transactions
            can&apos;t be edited; corrections are made with a reversing transaction.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
