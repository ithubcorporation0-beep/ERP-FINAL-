import { Plus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROJECT_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/config/projects";
import { DeadlineText } from "./deadline-text";
import { PROJECT_STATUS_TONES, TASK_PRIORITY_TONES, TASK_STATUS_TONES } from "./labels";
import { ProgressBar } from "./progress-bar";
import type { ProjectRow, TaskRow } from "./rows";

interface CreateLink {
  href: string;
  label: string;
}

function CreateButton({ create }: { create?: CreateLink }) {
  return create ? (
    <Button asChild size="sm" variant="outline">
      <Link href={create.href}>
        <Plus aria-hidden="true" />
        {create.label}
      </Link>
    </Button>
  ) : null;
}

/** A compact, read-only task list (e.g. on a project's page). */
export function TaskRowsTable({
  caption,
  rows,
  empty,
  create,
  footer,
}: {
  caption: string;
  rows: TaskRow[];
  empty: string;
  create?: CreateLink;
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <CreateButton create={create} />
      {rows.length === 0 ? (
        <EmptyState size="compact" title={empty} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Due date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/projects/tasks/${row.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={TASK_STATUS_TONES[row.status]}>
                      {TASK_STATUS_LABELS[row.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={TASK_PRIORITY_TONES[row.priority]} dot={false}>
                      {TASK_PRIORITY_LABELS[row.priority]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {row.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}
                  </TableCell>
                  <TableCell>
                    <DeadlineText dueLabel={row.dueLabel} deadline={row.deadline} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {footer}
    </div>
  );
}

/** A compact, read-only project list (customer page, reports). */
export function ProjectRowsTable({
  caption,
  rows,
  empty,
  create,
}: {
  caption: string;
  rows: ProjectRow[];
  empty: string;
  create?: CreateLink;
}) {
  return (
    <div className="space-y-3">
      <CreateButton create={create} />
      {rows.length === 0 ? (
        <EmptyState size="compact" title={empty} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>End date</TableHead>
                <TableHead className="text-right">Budget</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/projects/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.name}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{row.code}</p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={PROJECT_STATUS_TONES[row.status]}>
                      {PROJECT_STATUS_LABELS[row.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>{row.managerName ?? "—"}</TableCell>
                  <TableCell>
                    <ProgressBar value={row.work} label={`Progress of ${row.name}`} empty="No tasks" />
                    {row.tasksOverdue > 0 ? (
                      <p className="text-xs font-medium text-danger">{row.tasksOverdue} overdue tasks</p>
                    ) : null}
                  </TableCell>
                  <TableCell className={row.overdue ? "font-medium text-danger" : undefined}>
                    {row.endLabel ?? "—"}
                    {row.overdue ? " (overdue)" : ""}
                  </TableCell>
                  <TableCell className="text-right" data-numeric>
                    {row.budgetLabel ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
