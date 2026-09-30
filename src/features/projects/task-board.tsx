"use client";

import { Lock, MoreHorizontal, Paperclip } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskStatusKey,
} from "@/config/projects";
import { cn } from "@/lib/utils";
import { setTaskStatusAction } from "@/server/actions/project.actions";
import { DeadlineText } from "./deadline-text";
import { TASK_PRIORITY_TONES, TASK_STATUS_TONES } from "./labels";
import type { TaskRow } from "./rows";

const TOP_BORDER: Record<string, string> = {
  info: "border-t-info",
  warning: "border-t-warning",
  success: "border-t-success",
  danger: "border-t-danger",
  neutral: "border-t-neutral",
};

type Move = { task: TaskRow; to: TaskStatusKey };

/** Drag data type for a task id (checked on drag-over, so only task cards can be dropped). */
const DRAG_TYPE = "application/x-erp-task";

function applyMove(tasks: TaskRow[], { task, to }: Move): TaskRow[] {
  return tasks.map((item) =>
    item.id === task.id
      ? { ...item, status: to, deadline: to === "COMPLETED" ? "done" : item.deadline }
      : item,
  );
}

interface TaskBoardProps {
  tasks: TaskRow[];
  /** The user may move tasks (`tasks:edit`); tasks of completed or cancelled projects stay locked. */
  canMove: boolean;
}

/**
 * Kanban board of tasks by status. Drag a card to another column, or use its "Move to" menu (keyboard, screen
 * reader and touch friendly). Moves show immediately and are saved on the server; a failed save (no permission,
 * locked project, or someone else moved it first) puts the card back and explains why. Within a column, cards are
 * ordered by priority, then due date — there is no manual ordering.
 */
export function TaskBoard({ tasks: saved, canMove }: TaskBoardProps) {
  const router = useRouter();
  const [tasks, optimisticMove] = useOptimistic(saved, applyMove);
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatusKey | null>(null);

  function move(task: TaskRow, to: TaskStatusKey) {
    if (task.status === to) return;
    startTransition(async () => {
      optimisticMove({ task, to });
      const result = await setTaskStatusAction({ id: task.id, status: to });
      if (result.ok) toast.success(`${task.name} moved to ${TASK_STATUS_LABELS[to]}.`);
      else toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <ol className="flex snap-x gap-3 lg:grid lg:grid-cols-4" aria-label="Task board">
        {TASK_STATUSES.map((status) => {
          const column = tasks.filter((task) => task.status === status);
          return (
            <li
              key={status}
              aria-label={`${TASK_STATUS_LABELS[status]}: ${column.length} tasks`}
              className={cn(
                "flex w-72 shrink-0 snap-start flex-col rounded-xl border border-t-4 bg-muted/40 lg:w-auto",
                TOP_BORDER[TASK_STATUS_TONES[status]],
                over === status && "ring-2 ring-ring",
              )}
              onDragOver={(event) => {
                if (!canMove || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOver(status);
              }}
              onDragLeave={() => setOver((current) => (current === status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData(DRAG_TYPE);
                const task = tasks.find((item) => item.id === id);
                if (task) move(task, status);
                setDraggingId(null);
                setOver(null);
              }}
            >
              <h2 className="px-3 pt-3 pb-2 text-sm font-semibold">
                {TASK_STATUS_LABELS[status]}{" "}
                <span className="font-normal text-muted-foreground" data-numeric>
                  ({column.length})
                </span>
              </h2>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {column.map((task) => {
                  const movable = canMove && !task.locked;
                  return (
                    <li
                      key={task.id}
                      aria-label={task.name}
                      draggable={movable}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(DRAG_TYPE, task.id);
                        setDraggingId(task.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOver(null);
                      }}
                      className={cn(
                        "rounded-lg border bg-card p-3 shadow-xs",
                        movable && "cursor-grab active:cursor-grabbing",
                        draggingId === task.id && "opacity-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={`/projects/tasks/${task.id}`}
                            draggable={false}
                            className="block text-sm font-medium break-words hover:underline"
                          >
                            {task.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="font-mono">{task.code}</span> · {task.projectName}
                          </p>
                        </div>
                        {movable ? (
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Move ${task.name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Move to</DropdownMenuLabel>
                              {TASK_STATUSES.filter((next) => next !== task.status).map((next) => (
                                <DropdownMenuItem key={next} onSelect={() => move(task, next)}>
                                  {TASK_STATUS_LABELS[next]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : task.locked ? (
                          <Lock
                            role="img"
                            className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                            aria-label="Project closed — task can't be moved"
                          />
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <StatusBadge tone={TASK_PRIORITY_TONES[task.priority]} dot={false}>
                          {TASK_PRIORITY_LABELS[task.priority]}
                        </StatusBadge>
                        <DeadlineText dueLabel={task.dueLabel} deadline={task.deadline} compact />
                        {task.attachments > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                            <Paperclip className="size-3" aria-hidden="true" />
                            {task.attachments}
                            <span className="sr-only"> attachments</span>
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.assigneeName ?? "Unassigned"}
                      </p>
                    </li>
                  );
                })}
                {column.length === 0 ? (
                  <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    No tasks
                  </li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
