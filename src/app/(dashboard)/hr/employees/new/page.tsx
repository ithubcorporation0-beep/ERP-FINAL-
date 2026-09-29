import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { emptyEmployee } from "@/features/hr/defaults";
import { EmployeeForm } from "@/features/hr/employee-form";
import { authorizePage } from "@/lib/auth/page";
import { departmentService } from "@/server/services/department.service";
import { employeeService } from "@/server/services/employee.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const ctx = await authorizePage("employees:create");
  if (!ctx) return <AccessDenied />;
  const [departments, members, company] = await Promise.all([
    departmentService.list(ctx),
    employeeService.members(ctx),
    salesContext(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Add employee"
        description="The employee ID is issued when you save. Salary and bank details are added on the profile."
      />
      <Card className="shadow-xs">
        <CardContent>
          <EmployeeForm
            defaults={emptyEmployee(company.today)}
            departments={departments
              .filter((department) => department.isActive)
              .map((department) => ({ value: department.id, label: department.name }))}
            members={members.map((member) => ({ value: member.id, label: member.name }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
