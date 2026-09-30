"use client";

import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";
import { toast } from "sonner";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { TASK_STATUS_LABELS, TASK_STATUSES, type TaskStatusKey } from "@/config/projects";
import { cn } from "@/lib/utils";
import { assignTaskAction, setTaskStatusAction } from "@/server/actions/project.actions";

/** Status steps of a task, with a control to move it (when allowed). */
export function TaskStatusControl({
  id,
  status,
  canMove,
}: {
  id: string;
  status: TaskStatusKey;
  canMove: boolean;
}) {
  const router = useRouter();
  const selectId = useId();
  const [pending, startTransition] = useTransition();
  const reached = TASK_STATUSES.indexOf(status);

  function change(next: string) {
    const parsed = TASK_STATUSES.find((value) => value === next);
    if (!parsed || parsed === status) return;
    startTransition(async () => {
      const result = await setTaskStatusAction({ id, status: parsed });
      if (result.ok) toast.success(`Moved to ${TASK_STATUS_LABELS[parsed]}.`);
      else toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-4 gap-1" aria-label="Task status">
        {TASK_STATUSES.map((step, index) => (
          <li key={step} aria-current={step === status ? "step" : undefined} className="min-w-0">
            <span
              className={cn(
                "block h-1.5 rounded-full bg-muted",
                index <= reached && "bg-primary",
                status === "COMPLETED" && "bg-success",
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "mt-1 block truncate text-xs text-muted-foreground",
                step === status && "font-medium text-foreground",
              )}
            >
              {TASK_STATUS_LABELS[step]}
            </span>
          </li>
        ))}
      </ol>
      {canMove ? (
        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="text-sm text-muted-foreground">
            Status
          </label>
          <SelectInput
            id={selectId}
            value={status}
            onValueChange={change}
            disabled={pending}
            options={TASK_STATUSES.map((value) => ({ value, label: TASK_STATUS_LABELS[value] }))}
          />
        </div>
      ) : null}
    </div>
  );
}

const UNASSIGNED = "none";

/** Assigns the task to a current employee (task managers). */
export function TaskAssignControl({
  id,
  assigneeId,
  assignees,
}: {
  id: string;
  assigneeId: string | null;
  assignees: SelectOption[];
}) {
  const router = useRouter();
  const selectId = useId();
  const [pending, startTransition] = useTransition();

  function change(value: string) {
    const next = value === UNASSIGNED ? "" : value;
    if (next === (assigneeId ?? "")) return;
    startTransition(async () => {
      const result = await assignTaskAction({ id, assigneeId: next });
      if (result.ok) toast.success(next ? "Task assigned." : "Task unassigned.");
      else toast.error(result.error.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="text-sm text-muted-foreground">
        Assigned to
      </label>
      <SelectInput
        id={selectId}
        value={assigneeId ?? UNASSIGNED}
        onValueChange={change}
        disabled={pending}
        options={[{ value: UNASSIGNED, label: "Unassigned" }, ...assignees]}
      />
    </div>
  );
}
