import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRecordNumber } from "@/config/records";
import { EmployeeList } from "@/features/hr/employee-list";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate } from "@/lib/format";
import { can } from "@/lib/tenant";
import { employeeListQuerySchema } from "@/lib/validation";
import { departmentService } from "@/server/services/department.service";
import { employeeService } from "@/server/services/employee.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: PageProps<"/hr/employees">) {
  const ctx = await authorizePage("employees:view");
  if (!ctx) return <AccessDenied />;
  const query = employeeListQuerySchema.catch(employeeListQuerySchema.parse({})).parse(await searchParams);
  const [result, departments, company] = await Promise.all([
    employeeService.list(ctx, query),
    departmentService.list(ctx),
    salesContext(ctx),
  ]);
  const canCreate = can(ctx, "employees:create");

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who works for the company, with their department, position and status."
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/hr/employees/new">
                <Plus aria-hidden="true" />
                Add employee
              </Link>
            </Button>
          ) : undefined
        }
      />
      <EmployeeList
        rows={result.items.map((employee) => ({
          id: employee.id,
          code: formatRecordNumber("employee", employee.number),
          name: employee.name,
          position: employee.position,
          department: employee.department?.name ?? null,
          email: employee.email,
          phone: employee.phone,
          joiningDate: formatCalendarDate(employee.joiningDate, company),
          status: employee.status,
          photoUrl: employee.photoKey
            ? `/api/employees/${employee.id}/photo?v=${employee.photoUpdatedAt?.getTime() ?? 0}`
            : null,
        }))}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        departments={departments.map((department) => ({ value: department.id, label: department.name }))}
        canCreate={canCreate}
      />
    </>
  );
}
