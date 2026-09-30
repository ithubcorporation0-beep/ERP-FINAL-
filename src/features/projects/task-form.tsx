"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, TASK_STATUSES } from "@/config/projects";
import { FormStatus } from "@/features/auth/form-status";
import { taskSchema, type TaskInput } from "@/lib/validation";
import { createTaskAction, updateTaskAction } from "@/server/actions/project.actions";

const FIELDS = [
  "name",
  "projectId",
  "assigneeId",
  "priority",
  "status",
  "startDate",
  "dueDate",
  "description",
] as const;

const UNASSIGNED = "none";

interface TaskFormProps {
  taskId?: string;
  defaults: TaskInput;
  projects: SelectOption[];
  assignees: SelectOption[];
  /** Where "Cancel" goes. */
  backHref: string;
}

export function TaskForm({ taskId, defaults, projects, assignees, backHref }: TaskFormProps) {
  const router = useRouter();
  const form = useForm<TaskInput>({ resolver: zodResolver(taskSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: TaskInput) {
    if (taskId) {
      const result = await updateTaskAction(taskId, values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Task saved.");
      router.push(`/projects/tasks/${taskId}`);
    } else {
      const result = await createTaskAction(values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Task created.");
      router.push(`/projects/tasks/${result.data.id}`);
    }
    router.refresh();
  }

  const date = (name: "startDate" | "dueDate", label: string) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      render={({ field, control }) => <Input type="date" {...field} value={field.value ?? ""} {...control} />}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            label="Task name"
            required
            render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
          />
          <FormField
            control={form.control}
            name="projectId"
            label="Project"
            required
            description="Open projects only."
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || undefined}
                placeholder="Choose a project…"
                onValueChange={field.onChange}
                options={projects}
              />
            )}
          />
          <FormField
            control={form.control}
            name="assigneeId"
            label="Assigned employee"
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || UNASSIGNED}
                onValueChange={(value) => field.onChange(value === UNASSIGNED ? "" : value)}
                options={[{ value: UNASSIGNED, label: "Unassigned" }, ...assignees]}
              />
            )}
          />
          <FormField
            control={form.control}
            name="priority"
            label="Priority"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={TASK_PRIORITIES.map((value) => ({ value, label: TASK_PRIORITY_LABELS[value] }))}
              />
            )}
          />
          <FormField
            control={form.control}
            name="status"
            label="Status"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={TASK_STATUSES.map((value) => ({ value, label: TASK_STATUS_LABELS[value] }))}
              />
            )}
          />
          <div className="hidden md:block" aria-hidden="true" />
          {date("startDate", "Start date")}
          {date("dueDate", "Due date")}
          <FormField
            control={form.control}
            name="description"
            label="Description"
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={5} {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </div>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {taskId ? "Save changes" : "Create task"}
        </Button>
        <Button asChild variant="outline">
          <Link href={backHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
