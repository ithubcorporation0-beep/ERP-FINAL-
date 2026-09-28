import Link from "next/link";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { formatMoney } from "@/lib/format";

/** Presentational building blocks of the financial report pages (figures are computed on the server). */

export interface MoneyFormat {
  locale: string;
  currency: string;
}

export interface MoneyRow {
  key?: string;
  label: string;
  /** Account code, share %, count… shown in a muted column. */
  detail?: string;
  amount: string;
  href?: string;
}

/** A titled table of labelled amounts with an optional total row. */
export function MoneySection({
  title,
  rows,
  total,
  totalLabel = "Total",
  detailHeader,
  empty = "Nothing in this period.",
  format,
}: {
  title: string;
  rows: readonly MoneyRow[];
  total?: string;
  totalLabel?: string;
  detailHeader?: string;
  empty?: string;
  format: MoneyFormat;
}) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption className="sr-only">{title}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              {detailHeader ? <TableHead>{detailHeader}</TableHead> : null}
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={detailHeader ? 3 : 2} className="text-muted-foreground">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key ?? `${row.label}-${row.detail ?? ""}`}>
                  <TableCell>
                    {row.href ? (
                      <Link href={row.href} className="hover:underline">
                        {row.label}
                      </Link>
                    ) : (
                      row.label
                    )}
                  </TableCell>
                  {detailHeader ? (
                    <TableCell className="text-muted-foreground">{row.detail ?? ""}</TableCell>
                  ) : null}
                  <TableCell className="text-right whitespace-nowrap" data-numeric>
                    {formatMoney(row.amount, format)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {total === undefined ? null : (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={detailHeader ? 2 : 1}>{totalLabel}</TableCell>
                <TableCell className="text-right whitespace-nowrap" data-numeric>
                  {formatMoney(total, format)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}

/** Headline figures of a report. */
export function Figures({
  items,
  format,
}: {
  items: readonly { label: string; amount: string; tone?: "success" | "danger" }[];
  format: MoneyFormat;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-card p-4 shadow-xs">
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd
            className={
              item.tone === "danger"
                ? "text-xl font-semibold text-danger"
                : item.tone === "success"
                  ? "text-xl font-semibold text-success"
                  : "text-xl font-semibold"
            }
            data-numeric
          >
            {formatMoney(item.amount, format)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Whether a sub-ledger total agrees with its ledger account. */
export function ReconciliationNote({
  ok,
  account,
  ledgerBalance,
  format,
}: {
  ok: boolean;
  account: string;
  ledgerBalance: string;
  format: MoneyFormat;
}) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
      <StatusBadge tone={ok ? "success" : "warning"}>{ok ? "Reconciled" : "Difference"}</StatusBadge>
      {account} ledger balance: <strong data-numeric>{formatMoney(ledgerBalance, format)}</strong>
      {ok ? null : (
        <span className="text-muted-foreground">
          — differs from the open items; check manual transactions posted to this account.
        </span>
      )}
    </p>
  );
}
