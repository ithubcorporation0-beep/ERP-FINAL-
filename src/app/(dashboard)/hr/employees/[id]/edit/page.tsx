import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { EmployeeForm } from "@/features/hr/employee-form";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { departmentService } from "@/server/services/department.service";
import { employeeService } from "@/server/services/employee.service";

export const metadata: Metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: PageProps<"/hr/employees/[id]/edit">) {
  const ctx = await authorizePage("employees:edit");
  if (!ctx) return <AccessDenied />;
  const employee = await orNotFound(employeeService.get(ctx, recordIdOrNotFound((await params).id)));
  const [departments, members] = await Promise.all([
    departmentService.list(ctx),
    employeeService.members(ctx),
  ]);

  return (
    <>
      <PageHeader
        title={`Edit ${employee.name}`}
        description={formatRecordNumber("employee", employee.number)}
      />
      <Card className="shadow-xs">
        <CardContent>
          <EmployeeForm
            employeeId={employee.id}
            departments={departments
              .filter((department) => department.isActive || department.id === employee.departmentId)
              .map((department) => ({ value: department.id, label: department.name }))}
            members={members.map((member) => ({ value: member.id, label: member.name }))}
            defaults={{
              name: employee.name,
              email: employee.email ?? "",
              phone: employee.phone ?? "",
              identificationNumber: employee.identificationNumber ?? "",
              departmentId: employee.departmentId ?? "",
              position: employee.position ?? "",
              joiningDate: dateToDateOnly(employee.joiningDate),
              userId: employee.userId ?? "",
              emergencyContactName: employee.emergencyContactName ?? "",
              emergencyContactRelation: employee.emergencyContactRelation ?? "",
              emergencyContactPhone: employee.emergencyContactPhone ?? "",
              notes: employee.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
