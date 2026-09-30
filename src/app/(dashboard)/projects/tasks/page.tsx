import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRecordNumber } from "@/config/records";
import { TaskFilters } from "@/features/projects/filters";
import { toTaskRow } from "@/features/projects/rows";
import { TaskList } from "@/features/projects/task-list";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { taskListQuerySchema } from "@/lib/validation";
import { ownEmployee } from "@/server/services/hr-shared";
import { projectService } from "@/server/services/project.service";
import { salesContext } from "@/server/services/sales-shared";
import { taskService } from "@/server/services/task.service";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: PageProps<"/projects/tasks">) {
  const ctx = await authorizePage("tasks:view");
  if (!ctx) return <AccessDenied />;

  const query = taskListQuerySchema.catch(taskListQuerySchema.parse({})).parse(await searchParams);
  const [result, format, projects, own] = await Promise.all([
    taskService.list(ctx, query),
    salesContext(ctx),
    can(ctx, "projects:view") ? projectService.options(ctx) : [],
    ownEmployee(ctx),
  ]);
  const createHref = can(ctx, "tasks:create")
    ? `/projects/tasks/new${query.projectId ? `?projectId=${query.projectId}` : ""}`
    : null;

  return (
    <>
      <PageHeader
        title="Tasks"
        description={
          taskService.managesTasks(ctx)
            ? "Every task, who it's assigned to and when it's due."
            : "Tasks assigned to you and tasks in projects you manage."
        }
        actions={
          createHref ? (
            <Button asChild>
              <Link href={createHref}>
                <Plus aria-hidden="true" />
                New task
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <TaskFilters
          withMine={own !== null}
          projects={projects.map((project) => ({
            value: project.id,
            label: `${project.name} · ${formatRecordNumber("project", project.number)}`,
          }))}
        />
        <TaskList
          rows={result.items.map((task) => toTaskRow(task, format, format.today))}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          createHref={createHref}
        />
      </div>
    </>
  );
}
