import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { emptyLeave } from "@/features/hr/defaults";
import { LeaveForm } from "@/features/hr/leave-form";
import { authorizePage } from "@/lib/auth/page";
import { leaveService } from "@/server/services/leave.service";
import { ownEmployee } from "@/server/services/hr-shared";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Request leave" };

export default async function NewLeavePage() {
  const ctx = await authorizePage("leaves:create");
  if (!ctx) return <AccessDenied />;
  const [employees, own, company] = await Promise.all([
    leaveService.employees(ctx),
    ownEmployee(ctx),
    salesContext(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Request leave"
        description="It starts as pending; an approver approves or rejects it."
      />
      {!own && employees.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          Your login isn&apos;t linked to an employee record yet, so you can&apos;t request leave. Ask HR to
          link it.
        </p>
      ) : (
        <Card className="shadow-xs">
          <CardContent>
            <LeaveForm
              defaults={emptyLeave(company.today)}
              employees={employees.map((employee) => ({
                value: employee.id,
                label: `${employee.name} (${formatRecordNumber("employee", employee.number)})`,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}
