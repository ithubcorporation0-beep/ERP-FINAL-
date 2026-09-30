import type { Metadata } from "next";
import { Columns3, Pencil } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  OPEN_PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from "@/config/projects";
import { formatRecordNumber } from "@/config/records";
import { DeleteRecordButton } from "@/features/crm/delete-record-button";
import { DetailList } from "@/features/crm/detail-list";
import { HistoryList } from "@/features/crm/history-list";
import { PROJECT_STATUS_TONES } from "@/features/projects/labels";
import { ProgressBar } from "@/features/projects/progress-bar";
import { TaskRowsTable } from "@/features/projects/record-tables";
import { daysLeftLabel, toTaskRow } from "@/features/projects/rows";
import { authorizePage } from "@/lib/auth/page";
import { formatCalendarDate, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { orNotFound, recordIdOrNotFound } from "@/lib/page-data";
import { can } from "@/lib/tenant";
import { taskListQuerySchema } from "@/lib/validation";
import { deleteProjectAction } from "@/server/actions/project.actions";
import { projectService } from "@/server/services/project.service";
import { salesContext } from "@/server/services/sales-shared";
import { taskService } from "@/server/services/task.service";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const ctx = await authorizePage("projects:view");
  if (!ctx) return <AccessDenied />;
  const id = recordIdOrNotFound((await params).id);
  const project = await orNotFound(projectService.detail(ctx, id));
  const seesTasks = can(ctx, "tasks:view");
  const [format, history, tasks] = await Promise.all([
    salesContext(ctx),
    projectService.history(ctx, id),
    seesTasks ? taskService.list(ctx, taskListQuerySchema.parse({ projectId: id, pageSize: 100 })) : null,
  ]);
  const code = formatRecordNumber("project", project.number);
  const open = OPEN_PROJECT_STATUSES.includes(project.status);
  const { progress } = project;
  const projectFormat = { ...format, currency: project.currency };

  return (
    <>
      <PageHeader
        title={project.name}
        description={[code, project.customer?.name].filter(Boolean).join(" · ")}
        actions={
          <>
            {seesTasks ? (
              <Button asChild variant="outline">
                <Link href={`/projects/board?projectId=${id}`}>
                  <Columns3 aria-hidden="true" />
                  Board
                </Link>
              </Button>
            ) : null}
            {can(ctx, "projects:edit") ? (
              <Button asChild variant="outline">
                <Link href={`/projects/${id}/edit`}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              </Button>
            ) : null}
            {/* Projects with tasks can't be deleted; the server explains that if someone tries. */}
            {can(ctx, "projects:delete") ? (
              <DeleteRecordButton
                noun="project"
                name={project.name}
                action={deleteProjectAction.bind(null, id)}
                redirectTo="/projects"
              />
            ) : null}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <StatusBadge tone={PROJECT_STATUS_TONES[project.status]}>
          {PROJECT_STATUS_LABELS[project.status]}
        </StatusBadge>
        {progress.overdue ? <StatusBadge tone="danger">Past its end date</StatusBadge> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Progress</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Work done</p>
                  <ProgressBar value={progress.work} label="Work done" empty="No tasks yet" />
                  <p className="text-xs text-muted-foreground">
                    {progress.counts.byStatus.COMPLETED} of {progress.counts.total} tasks completed
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Time elapsed</p>
                  <ProgressBar
                    value={progress.time}
                    label="Time elapsed"
                    tone={progress.overdue ? "danger" : "muted"}
                    empty={open ? "Set a start and end date to track time" : "Project closed"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {daysLeftLabel(progress.daysLeft) ?? (open ? "No end date" : "")}
                  </p>
                </div>
              </div>
              {progress.work !== null && progress.time !== null && progress.time > progress.work ? (
                <p className="text-sm text-warning" role="status">
                  Behind schedule: {progress.time}% of the time has passed but {progress.work}% of the work is
                  done.
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {TASK_STATUSES.map((status) => (
                  <div key={status} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{TASK_STATUS_LABELS[status]}</dt>
                    <dd className="text-lg font-semibold" data-numeric>
                      {progress.counts.byStatus[status]}
                    </dd>
                  </div>
                ))}
                <div className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">Overdue</dt>
                  <dd
                    className={
                      progress.counts.overdue > 0
                        ? "text-lg font-semibold text-danger"
                        : "text-lg font-semibold"
                    }
                    data-numeric
                  >
                    {progress.counts.overdue}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {tasks ? (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Tasks ({tasks.total})</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TaskRowsTable
                  caption={`Tasks of ${project.name}`}
                  rows={tasks.items.map((task) => toTaskRow(task, format, format.today))}
                  empty="No tasks yet"
                  create={
                    open && can(ctx, "tasks:create")
                      ? { href: `/projects/tasks/new?projectId=${id}`, label: "New task" }
                      : undefined
                  }
                  footer={
                    tasks.total > tasks.items.length ? (
                      <p className="text-xs text-muted-foreground">
                        Showing {tasks.items.length} of {tasks.total}.{" "}
                        <Link
                          href={`/projects/tasks?projectId=${id}`}
                          className="text-primary hover:underline"
                        >
                          See all
                        </Link>
                      </p>
                    ) : null
                  }
                />
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Details</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DetailList
                items={[
                  { label: "Project ID", value: <span className="font-mono">{code}</span> },
                  { label: "Status", value: PROJECT_STATUS_LABELS[project.status] },
                  {
                    label: "Customer",
                    value: project.customer ? (
                      can(ctx, "customers:view") ? (
                        <Link
                          className="text-primary hover:underline"
                          href={`/crm/customers/${project.customer.id}`}
                        >
                          {project.customer.name}
                        </Link>
                      ) : (
                        project.customer.name
                      )
                    ) : null,
                  },
                  { label: "Manager", value: project.manager?.name },
                  {
                    label: "Start date",
                    value: project.startDate ? formatCalendarDate(project.startDate, format) : null,
                  },
                  {
                    label: "End date",
                    value: project.endDate ? formatCalendarDate(project.endDate, format) : null,
                  },
                  { label: "Budget", value: formatMoney(project.budget, projectFormat) },
                  {
                    label: "Completed",
                    value: project.completedAt ? formatDateTime(project.completedAt, format) : null,
                  },
                  {
                    label: "Created",
                    value: `${formatDate(project.createdAt, format)}${project.createdBy ? ` by ${project.createdBy.name}` : ""}`,
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
              {project.description ? (
                <p className="text-sm whitespace-pre-wrap">{project.description}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No description.</p>
              )}
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
