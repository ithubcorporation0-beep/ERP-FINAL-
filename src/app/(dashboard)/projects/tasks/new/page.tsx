import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { emptyTask } from "@/features/projects/defaults";
import { TaskForm } from "@/features/projects/task-form";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";
import { projectService } from "@/server/services/project.service";
import { taskService } from "@/server/services/task.service";

export const metadata: Metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: PageProps<"/projects/tasks/new">) {
  const ctx = await authorizePage("tasks:create");
  if (!ctx) return <AccessDenied />;
  const [projects, assignees] = await Promise.all([
    can(ctx, "projects:view") ? projectService.options(ctx) : [],
    taskService.assignees(ctx),
  ]);
  // "New task" from a project's page preselects that project (only if it's open and visible).
  const projectId = idSchema.safeParse((await searchParams).projectId).data;
  const preselected = projects.some((project) => project.id === projectId) ? projectId : undefined;

  return (
    <>
      <PageHeader title="New task" description="A Task ID is assigned automatically when you save." />
      <Card className="shadow-xs">
        <CardContent>
          {projects.length === 0 ? (
            <EmptyState
              size="compact"
              title="No open projects"
              description="Tasks belong to a project. Create a project (or reopen one) first."
            />
          ) : (
            <TaskForm
              defaults={emptyTask(preselected ?? "")}
              backHref={preselected ? `/projects/${preselected}` : "/projects/tasks"}
              projects={projects.map((project) => ({
                value: project.id,
                label: `${project.name} · ${formatRecordNumber("project", project.number)}`,
              }))}
              assignees={assignees.map((employee) => ({
                value: employee.id,
                label: `${employee.name} · ${formatRecordNumber("employee", employee.number)}`,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
