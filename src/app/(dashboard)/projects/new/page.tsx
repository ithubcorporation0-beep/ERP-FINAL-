import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { emptyProject } from "@/features/projects/defaults";
import { ProjectForm } from "@/features/projects/project-form";
import { authorizePage } from "@/lib/auth/page";
import { idSchema } from "@/lib/validation";
import { projectService } from "@/server/services/project.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: PageProps<"/projects/new">) {
  const ctx = await authorizePage("projects:create");
  if (!ctx) return <AccessDenied />;
  const [{ customers, managers }, { currency, today }] = await Promise.all([
    projectService.formOptions(ctx),
    salesContext(ctx),
  ]);
  // "New project" from a customer's page preselects that customer (only if it's one of the options).
  const customerId = idSchema.safeParse((await searchParams).customerId).data;
  const preselected = customers.some((option) => option.value === customerId) ? customerId : undefined;

  return (
    <>
      <PageHeader title="New project" description="A Project ID is assigned automatically when you save." />
      <Card className="shadow-xs">
        <CardContent>
          <ProjectForm
            defaults={{ ...emptyProject(today), customerId: preselected ?? "" }}
            customers={customers}
            managers={managers}
            currency={currency}
          />
        </CardContent>
      </Card>
    </>
  );
}
