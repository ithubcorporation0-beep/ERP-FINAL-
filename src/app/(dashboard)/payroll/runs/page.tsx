import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { PAYROLL_STATUS_LABELS, PAYROLL_STATUSES } from "@/config/payroll";
import { payrollRunRow } from "@/features/payroll/rows";
import { SalesList } from "@/features/sales/sales-lists";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { payrollListQuerySchema } from "@/lib/validation";
import { payrollService } from "@/server/services/payroll.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Payroll runs" };

export default async function PayrollRunsPage({ searchParams }: PageProps<"/payroll/runs">) {
  const ctx = await authorizePage("payroll:view");
  if (!ctx) return <AccessDenied />;
  const query = payrollListQuerySchema.catch(payrollListQuerySchema.parse({})).parse(await searchParams);
  const [result, company] = await Promise.all([payrollService.list(ctx, query), salesContext(ctx)]);
  const canCreate = can(ctx, "payroll:create");

  return (
    <>
      <PageHeader
        title="Payroll runs"
        description="One payroll per month: process, review, approve, pay, then download salary slips."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/payroll/runs/new">
                <Plus aria-hidden="true" />
                Process payroll
              </Link>
            </Button>
          ) : undefined
        }
      />
      <SalesList
        rows={result.items.map((run) => payrollRunRow(run, company))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        config={{
          caption: "Payroll runs",
          searchLabel: "Search payroll runs",
          searchPlaceholder: "Search a number like PRL-0003…",
          filterKey: "status",
          filterLabel: "Statuses",
          filterOptions: PAYROLL_STATUSES.map((status) => ({
            value: status,
            label: PAYROLL_STATUS_LABELS[status],
          })),
          columns: {
            code: "Payroll",
            party: "Month",
            date: "Pay date",
            secondary: "Payslips",
            amount: "Net total",
          },
          empty: {
            icon: "payroll",
            title: "No payroll yet",
            description: "Set basic salaries on employee profiles, then process your first month.",
            ...(canCreate ? { createHref: "/payroll/runs/new", createLabel: "Process payroll" } : {}),
          },
        }}
      />
    </>
  );
}
