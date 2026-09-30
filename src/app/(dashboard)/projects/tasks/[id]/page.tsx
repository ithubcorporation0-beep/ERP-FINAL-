import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROJECT_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/config/projects";
import { formatRecordNumber } from "@/config/records";
import { DeleteRecordButton } from "@/features/crm/delete-record-button";
import { DetailList } from "@/features/crm/detail-list";
import { DocumentPanel } from "@/features/crm/document-panel";
import { HistoryList } from "@/features/crm/history-list";
import { DeadlineText } from "@/features/projects/deadline-text";
import { TASK_PRIORITY_TONES, TASK_STATUS_TONES } from "@/features/projects/labels";
import { toTaskRow } from "@/features/projects/rows";
import { TaskAssignControl, TaskStatusControl } from "@/features/projects/task-actions";
import { authorizePage } from "@/lib/auth/page";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { deleteTaskAction } from "@/server/actions/project.actions";
import { salesContext } from "@/server/services/sales-shared";
import { taskService } from "@/server/services/task.service";

export const metadata: Metadata = { title: "Task" };

export default async function TaskPage({ params }: PageProps<"/projects/tasks/[id]">) {
  const ctx = await authorizePage("tasks:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const task = await orNotFound(taskService.get(ctx, id));
  const abilities = taskService.abilities(ctx, task);
  const [format, history, attachments, assignees] = await Promise.all([
    salesContext(ctx),
    taskService.history(ctx, id),
    taskService.attachments(ctx, id),
    abilities.edit ? taskService.assignees(ctx) : [],
  ]);
  const row = toTaskRow(task, format, format.today);
  const manager = taskService.managesTasks(ctx);
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
        title={task.name}
        description={`${row.code} · ${task.project.name}`}
        actions={
          <>
            {abilities.edit ? (
              <Button asChild variant="outline">
                <Link href={`/projects/tasks/${id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {abilities.delete ? (
              <DeleteRecordButton
                noun="task"
                name={task.name}
                action={deleteTaskAction.bind(null, id)}
                redirectTo={`/projects/${task.project.id}`}
              />
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone={TASK_STATUS_TONES[task.status]}>{TASK_STATUS_LABELS[task.status]}</StatusBadge>
        <StatusBadge tone={TASK_PRIORITY_TONES[task.priority]} dot={false}>
          {TASK_PRIORITY_LABELS[task.priority]} priority
        </StatusBadge>
        {row.locked ? (
          <StatusBadge tone="neutral">
            Project {PROJECT_STATUS_LABELS[task.project.status].toLowerCase()} — read only
          </StatusBadge>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Status and assignment</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <TaskStatusControl id={id} status={task.status} canMove={abilities.move} />
              {abilities.edit ? (
                <TaskAssignControl id={id} assigneeId={task.assigneeId} assignees={assigneeOptions} />
              ) : (
                <p className="text-sm">
                  Assigned to: <span className="font-medium">{task.assignee?.name ?? "Unassigned"}</span>
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Task ID", value: <span className="font-mono">{row.code}</span> },
                  {
                    label: "Project",
                    value: can(ctx, "projects:view") ? (
                      <Link className="text-primary hover:underline" href={`/projects/${task.project.id}`}>
                        {row.projectCode} · {task.project.name}
                      </Link>
                    ) : (
                      `${row.projectCode} · ${task.project.name}`
                    ),
                  },
                  { label: "Assigned employee", value: task.assignee?.name ?? "Unassigned" },
                  { label: "Priority", value: TASK_PRIORITY_LABELS[task.priority] },
                  { label: "Start date", value: row.startLabel },
                  {
                    label: "Due date",
                    value: row.dueLabel ? (
                      <DeadlineText dueLabel={row.dueLabel} deadline={row.deadline} />
                    ) : null,
                  },
                  {
                    label: "Completed",
                    value: task.completedAt ? formatDateTime(task.completedAt, format) : null,
                  },
                  {
                    label: "Created",
                    value: `${formatDate(task.createdAt, format)}${task.createdBy ? ` by ${task.createdBy.name}` : ""}`,
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Description</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {task.description ? (
                <p className="text-sm whitespace-pre-wrap">{task.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Attachments ({attachments.length})</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DocumentPanel
                noun="attachment"
                endpoint={`/api/tasks/${id}/attachments`}
                canEdit={abilities.attach}
                documents={attachments.map((attachment) => ({
                  id: attachment.id,
                  name: attachment.name,
                  sizeLabel: formatBytes(attachment.sizeBytes, format),
                  uploadedBy: attachment.createdBy?.name ?? null,
                  uploadedAt: attachment.createdAt.toISOString(),
                  uploadedAtLabel: formatDateTime(attachment.createdAt, format),
                  // Task managers may delete any attachment; others only what they uploaded.
                  canDelete: abilities.attach && (manager || attachment.createdById === ctx.userId),
                }))}
              />
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit shadow-xs">
          <CardHeader>
            <CardTitle>
              <h2>History</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryList
              items={history.map((entry) => ({
                ...entry,
                at: entry.at.toISOString(),
                atLabel: formatDateTime(entry.at, format),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
