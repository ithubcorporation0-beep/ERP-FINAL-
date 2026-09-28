import type { Metadata } from "next";
import { FileBarChart } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FINANCIAL_REPORTS } from "@/config/accounting";
import { authorizePage } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Financial reports" };

export default async function FinancialReportsPage() {
  const ctx = await authorizePage("accounting:view");
  if (!ctx) return <AccessDenied />;

  return (
    <>
      <PageHeader
        title="Financial reports"
        description="Computed from the ledger and the sales and expense records. See each report for what it covers."
      />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {FINANCIAL_REPORTS.map((report) => (
          <li key={report.slug}>
            <Link
              href={`/finance/reports/${report.slug}`}
              className="block h-full rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Card className="h-full shadow-xs transition-colors hover:bg-muted/50">
                <CardHeader>
                  <FileBarChart className="mb-2 size-5 text-primary" aria-hidden="true" />
                  <CardTitle>
                    <h2>{report.label}</h2>
                  </CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
