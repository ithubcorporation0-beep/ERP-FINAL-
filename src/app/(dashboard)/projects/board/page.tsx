import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { formatRecordNumber } from "@/config/records";
import { TaskFilters } from "@/features/projects/filters";
import { toTaskRow } from "@/features/projects/rows";
import { TaskBoard } from "@/features/projects/task-board";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { taskListQuerySchema } from "@/lib/validation";
import { ownEmployee } from "@/server/services/hr-shared";
import { projectService } from "@/server/services/project.service";
import { salesContext } from "@/server/services/sales-shared";
import { taskService } from "@/server/services/task.service";

export const metadata: Metadata = { title: "Task board" };

export default async function TaskBoardPage({ searchParams }: PageProps<"/projects/board">) {
  const ctx = await authorizePage("tasks:view");
  if (!ctx) return <AccessDenied />;

  const { projectId, mine } = taskListQuerySchema
    .catch(taskListQuerySchema.parse({}))
    .parse(await searchParams);
  const [tasks, format, projects, own] = await Promise.all([
    taskService.board(ctx, { projectId, mine: mine === "1" }),
    salesContext(ctx),
    can(ctx, "projects:view") ? projectService.options(ctx) : [],
    ownEmployee(ctx),
  ]);
  const createHref = can(ctx, "tasks:create")
    ? `/projects/tasks/new${projectId ? `?projectId=${projectId}` : ""}`
    : null;

  return (
    <>
      <PageHeader
        title="Task board"
        description="Drag a task to another column, or use its menu to move it."
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
          board
          withMine={own !== null}
          projects={projects.map((project) => ({
            value: project.id,
            label: `${project.name} · ${formatRecordNumber("project", project.number)}`,
          }))}
        />
        {tasks.length >= 500 ? (
          <p className="text-sm text-muted-foreground" role="status">
            Showing the first 500 tasks. Filter by project to see the rest.
          </p>
        ) : null}
        <TaskBoard
          canMove={can(ctx, "tasks:edit")}
          tasks={tasks.map((task) => toTaskRow(task, format, format.today))}
        />
      </div>
    </>
  );
}
