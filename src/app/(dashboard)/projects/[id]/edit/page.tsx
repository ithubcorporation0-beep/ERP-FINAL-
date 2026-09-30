import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { ProjectForm } from "@/features/projects/project-form";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { money } from "@/lib/money";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { projectService } from "@/server/services/project.service";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[id]/edit">) {
  const ctx = await authorizePage("projects:edit");
  if (!ctx) return <AccessDenied />;
  const project = await orNotFound(projectService.get(ctx, recordIdOrNotFound((await params).id)));
  const { customers, managers } = await projectService.formOptions(ctx);
  // Keep the current customer/manager selectable even if no longer offered (blocked customer, former employee),
  // so saving doesn't silently clear them.
  if (project.customer && !customers.some((option) => option.value === project.customer?.id)) {
    customers.push({ value: project.customer.id, label: `${project.customer.name} (not available)` });
  }
  if (project.manager && !managers.some((option) => option.value === project.manager?.id)) {
    managers.push({ value: project.manager.id, label: `${project.manager.name} (no longer current)` });
  }

  return (
    <>
      <PageHeader
        title={`Edit ${project.name}`}
        description={`Project ID ${formatRecordNumber("project", project.number)}`}
      />
      <Card className="shadow-xs">
        <CardContent>
          <ProjectForm
            projectId={project.id}
            customers={customers}
            managers={managers}
            currency={project.currency}
            defaults={{
              name: project.name,
              customerId: project.customerId ?? "",
              managerId: project.managerId ?? "",
              startDate: project.startDate ? dateToDateOnly(project.startDate) : "",
              endDate: project.endDate ? dateToDateOnly(project.endDate) : "",
              budget: project.budget ? money(project.budget) : "",
              status: project.status,
              description: project.description ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
