import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteDepartmentButton, DepartmentDialog } from "@/features/hr/department-dialog";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { departmentService } from "@/server/services/department.service";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const ctx = await authorizePage("employees:view");
  if (!ctx) return <AccessDenied />;
  const departments = await departmentService.list(ctx);
  const canCreate = can(ctx, "employees:create");
  const canEdit = can(ctx, "employees:edit");
  const canDelete = can(ctx, "employees:delete");

  return (
    <>
      <PageHeader
        title="Departments"
        description="Group employees for filtering and attendance reports."
        actions={canCreate ? <DepartmentDialog /> : undefined}
      />
      <Card className="shadow-xs">
        <CardContent>
          {departments.length === 0 ? (
            <EmptyState
              size="compact"
              icon={Building2}
              title="No departments yet"
              description={canCreate ? "Add departments such as Sales, Engineering or Finance." : undefined}
            />
          ) : (
            <Table>
              <TableCaption className="sr-only">Departments</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Department</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="w-40">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((department) => (
                  <TableRow key={department.id}>
                    <TableCell className="font-medium">
                      {department.name}
                      {department.isActive ? null : (
                        <StatusBadge tone="neutral" className="ml-2">
                          Inactive
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{department.description ?? ""}</TableCell>
                    <TableCell className="text-right">
                      <Link href={`/hr/employees?departmentId=${department.id}`} className="hover:underline">
                        {department._count.employees}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canEdit ? (
                          <DepartmentDialog
                            department={{
                              id: department.id,
                              name: department.name,
                              description: department.description ?? "",
                              isActive: department.isActive,
                            }}
                          />
                        ) : null}
                        {canDelete && department._count.employees === 0 ? (
                          <DeleteDepartmentButton id={department.id} name={department.name} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
