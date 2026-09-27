import { Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SalesRow } from "./sales-lists";

interface SalesRowsTableProps {
  caption: string;
  rows: SalesRow[];
  empty: string;
  create?: { href: string; label: string };
}

/** A compact, read-only list of sales documents (e.g. on a customer's page). */
export function SalesRowsTable({ caption, rows, empty, create }: SalesRowsTableProps) {
  return (
    <div className="space-y-3">
      {create ? (
        <Button asChild size="sm" variant="outline">
          <Link href={create.href}>
            <Plus aria-hidden="true" />
            {create.label}
          </Link>
        </Button>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState size="compact" title={empty} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={row.href}
                      className="font-mono text-xs font-medium text-primary hover:underline"
                    >
                      {row.code}
                    </Link>
                    {row.reference ? (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{row.reference}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="text-right whitespace-nowrap" data-numeric>
                    {row.amount}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap" data-numeric>
                    {row.balance ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={row.status.tone}>{row.status.label}</StatusBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
