import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OPEN_PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUSES } from "@/config/projects";
import { ProjectRowsTable } from "@/features/projects/record-tables";
import { toProjectRow } from "@/features/projects/rows";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { projectService } from "@/server/services/project.service";
import { salesContext } from "@/server/services/sales-shared";

export const metadata: Metadata = { title: "Project reports" };

function Figure({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-xs">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={danger && value > 0 ? "text-2xl font-semibold text-danger" : "text-2xl font-semibold"}
        data-numeric
      >
        {value}
      </dd>
    </div>
  );
}

export default async function ProjectReportsPage() {
  const ctx = await authorizePage("projects:view");
  if (!ctx) return <AccessDenied />;
  const [report, format] = await Promise.all([projectService.report(ctx), salesContext(ctx)]);
  const rows = report.projects.map((project) =>
    toProjectRow(project, { ...format, currency: project.currency }),
  );
  const open = rows.filter((row) => OPEN_PROJECT_STATUSES.includes(row.status));
  const counts = new Map(report.byStatus.map((row) => [row.status, row.count]));
  // "Behind schedule": more time has passed than work is done.
  const behind = open.filter((row) => row.work !== null && row.time !== null && row.time > row.work);

  return (
    <>
      <PageHeader
        title="Project reports"
        description={
          projectService.seesAll(ctx)
            ? "Progress, deadlines and open work across all projects."
            : "Progress and deadlines of the projects you manage or have tasks in."
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No projects yet" description="Reports appear once projects have been created." />
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label="Open projects" value={open.length} />
            <Figure label="Past their end date" value={open.filter((row) => row.overdue).length} danger />
            <Figure label="Behind schedule" value={behind.length} danger />
            <Figure
              label="Overdue tasks"
              value={open.reduce((sum, row) => sum + row.tasksOverdue, 0)}
              danger
            />
          </dl>

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Projects by status</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {PROJECT_STATUSES.map((status) => (
                  <div key={status} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{PROJECT_STATUS_LABELS[status]}</dt>
                    <dd className="text-lg font-semibold" data-numeric>
                      {counts.get(status) ?? 0}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Open projects: progress and deadlines</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectRowsTable caption="Open projects" rows={open} empty="No open projects" />
            </CardContent>
          </Card>

          {can(ctx, "tasks:view") ? (
            <Card className="shadow-xs">
              <CardHeader>
                <CardTitle>
                  <h2>Open work per person</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {report.workload.length === 0 ? (
                  <EmptyState size="compact" title="No open tasks" />
                ) : (
                  <Table>
                    <TableCaption className="sr-only">Open tasks per assignee</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Assigned to</TableHead>
                        <TableHead className="text-right">Open tasks</TableHead>
                        <TableHead className="text-right">Overdue</TableHead>
                        <TableHead className="text-right">Urgent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.workload.map((row) => (
                        <TableRow key={row.id ?? "unassigned"}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell className="text-right" data-numeric>
                            {row.open}
                          </TableCell>
                          <TableCell
                            className={row.overdue > 0 ? "text-right font-medium text-danger" : "text-right"}
                            data-numeric
                          >
                            {row.overdue}
                          </TableCell>
                          <TableCell className="text-right" data-numeric>
                            {row.urgent}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle>
                <h2>Completed and cancelled projects</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectRowsTable
                caption="Closed projects"
                rows={rows.filter((row) => !OPEN_PROJECT_STATUSES.includes(row.status))}
                empty="No completed or cancelled projects"
              />
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
