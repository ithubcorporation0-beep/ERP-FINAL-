import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, NORMAL_SIDE } from "@/config/accounting";
import { AccountDialog, DeleteAccountButton } from "@/features/finance/account-dialog";
import { authorizePage } from "@/lib/auth/page";
import { formatMoney } from "@/lib/format";
import { compareMoney } from "@/lib/money";
import { can } from "@/lib/tenant";
import { accountingService } from "@/server/services/accounting.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Chart of accounts" };

const GROUP_TITLES = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expenses",
} as const;

export default async function AccountsPage() {
  const ctx = await authorizePage("accounting:view");
  if (!ctx) return <AccessDenied />;
  const [accounts, sales] = await Promise.all([accountingService.accounts(ctx), salesContext(ctx)]);
  const format = { locale: sales.locale, currency: sales.currency };
  const canEdit = can(ctx, "accounting:edit");
  const canDelete = can(ctx, "accounting:delete");

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description="Every transaction debits and credits these accounts. Balances include all posted transactions."
        actions={can(ctx, "accounting:create") ? <AccountDialog /> : undefined}
      />
      <div className="space-y-4">
        {ACCOUNT_TYPES.map((type) => {
          const group = accounts.filter((account) => account.type === type);
          return (
            <Card key={type} className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>{GROUP_TITLES[type]}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableCaption className="sr-only">
                    {GROUP_TITLES[type]} accounts (normal balance: {NORMAL_SIDE[type]})
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="w-40">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          No {ACCOUNT_TYPE_LABELS[type].toLowerCase()} accounts.
                        </TableCell>
                      </TableRow>
                    ) : (
                      group.map((account) => {
                        const hasLines =
                          compareMoney(account.debit, "0.00") !== 0 ||
                          compareMoney(account.credit, "0.00") !== 0;
                        return (
                          <TableRow key={account.id}>
                            <TableCell className="font-mono text-xs">{account.code}</TableCell>
                            <TableCell>
                              <Link
                                href={`/finance/accounts/${account.id}`}
                                className="font-medium hover:underline"
                              >
                                {account.name}
                              </Link>
                              {account.systemKey ? (
                                <span className="ml-2 text-xs text-muted-foreground">system</span>
                              ) : null}
                              {account.isActive ? null : (
                                <StatusBadge tone="neutral" className="ml-2">
                                  Inactive
                                </StatusBadge>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap" data-numeric>
                              {formatMoney(account.balance, format)}
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                {canEdit ? (
                                  <AccountDialog
                                    account={{
                                      id: account.id,
                                      code: account.code,
                                      name: account.name,
                                      type: account.type,
                                      description: account.description ?? "",
                                      isActive: account.isActive,
                                      system: account.systemKey !== null,
                                      hasLines,
                                    }}
                                  />
                                ) : null}
                                {canDelete && !account.systemKey && !hasLines ? (
                                  <DeleteAccountButton id={account.id} name={account.name} />
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
