import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatRecordNumber } from "@/config/records";
import { TaskForm } from "@/features/projects/task-form";
import { authorizePage } from "@/lib/auth/page";
import { dateToDateOnly } from "@/lib/date-range";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { projectService } from "@/server/services/project.service";
import { taskService } from "@/server/services/task.service";

export const metadata: Metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: PageProps<"/projects/tasks/[id]/edit">) {
  const ctx = await authorizePage("tasks:edit");
  if (!ctx) return <AccessDenied />;
  const task = await orNotFound(taskService.get(ctx, recordIdOrNotFound((await params).id)));
  if (!taskService.abilities(ctx, task).edit) {
    return (
      <AccessDenied message="Only task managers edit tasks, and tasks of completed or cancelled projects are read only. You can still change the status of your own tasks on the task page." />
    );
  }
  const [projects, assignees] = await Promise.all([
    can(ctx, "projects:view") ? projectService.options(ctx) : [],
    taskService.assignees(ctx),
  ]);
  const projectOptions = projects.map((project) => ({
    value: project.id,
    label: `${project.name} · ${formatRecordNumber("project", project.number)}`,
  }));
  if (!projectOptions.some((option) => option.value === task.project.id)) {
    projectOptions.push({ value: task.project.id, label: task.project.name });
  }
  const assigneeOptions = assignees.map((employee) => ({
    value: employee.id,
    label: `${employee.name} · ${formatRecordNumber("employee", employee.number)}`,
  }));
  if (task.assignee && !assigneeOptions.some((option) => option.value === task.assignee?.id)) {
    assigneeOptions.push({ value: task.assignee.id, label: `${task.assignee.name} (no longer current)` });
  }

  return (
    <>
      <PageHeader
        title={`Edit ${task.name}`}
        description={`Task ID ${formatRecordNumber("task", task.number)}`}
      />
      <Card className="shadow-xs">
        <CardContent>
          <TaskForm
            taskId={task.id}
            backHref={`/projects/tasks/${task.id}`}
            projects={projectOptions}
            assignees={assigneeOptions}
            defaults={{
              name: task.name,
              projectId: task.projectId,
              assigneeId: task.assigneeId ?? "",
              priority: task.priority,
              status: task.status,
              startDate: task.startDate ? dateToDateOnly(task.startDate) : "",
              dueDate: task.dueDate ? dateToDateOnly(task.dueDate) : "",
              description: task.description ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
