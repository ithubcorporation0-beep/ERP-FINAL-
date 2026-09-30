import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ProcessPayrollForm } from "@/features/payroll/process-payroll-form";
import { authorizePage } from "@/lib/auth/page";
import { addDays } from "@/lib/date-range";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Process payroll" };

export default async function ProcessPayrollPage() {
  const ctx = await authorizePage("payroll:create");
  if (!ctx) return <AccessDenied />;
  const { today } = await salesContext(ctx);
  const period = today.slice(0, 7);
  const [year = 0, month = 0] = period.split("-").map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  return (
    <>
      <PageHeader
        title="Process payroll"
        description="Creates one payslip per employee from their salary structure and outstanding advances. You can review and adjust before submitting."
      />
      <Card className="shadow-xs">
        <CardContent>
          <ProcessPayrollForm defaults={{ period, payDate: addDays(nextMonth, -1), notes: "" }} />
        </CardContent>
      </Card>
    </>
  );
}
