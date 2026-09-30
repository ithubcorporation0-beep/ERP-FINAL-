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
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES } from "@/config/projects";
import { FormStatus } from "@/features/auth/form-status";
import { projectSchema, type ProjectInput } from "@/lib/validation";
import { createProjectAction, updateProjectAction } from "@/server/actions/project.actions";

const FIELDS = [
  "name",
  "customerId",
  "managerId",
  "startDate",
  "endDate",
  "budget",
  "status",
  "description",
] as const;

const NONE = "none";

interface ProjectFormProps {
  projectId?: string;
  defaults: ProjectInput;
  customers: SelectOption[];
  managers: SelectOption[];
  currency: string;
}

export function ProjectForm({ projectId, defaults, customers, managers, currency }: ProjectFormProps) {
  const router = useRouter();
  const form = useForm<ProjectInput>({ resolver: zodResolver(projectSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ProjectInput) {
    if (projectId) {
      const result = await updateProjectAction(projectId, values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Project saved.");
      router.push(`/projects/${projectId}`);
    } else {
      const result = await createProjectAction(values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Project created.");
      router.push(`/projects/${result.data.id}`);
    }
    router.refresh();
  }

  const text = (
    name: "name" | "startDate" | "endDate" | "budget",
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      required={name === "name"}
      render={({ field, control }) => <Input {...props} {...field} value={field.value ?? ""} {...control} />}
    />
  );

  const choice = (name: "customerId" | "managerId", label: string, options: SelectOption[], hint: string) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      description={hint}
      render={({ field, control }) => (
        <SelectInput
          {...control}
          className="sm:w-full"
          value={field.value || NONE}
          onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
          options={[{ value: NONE, label: "None" }, ...options]}
        />
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          {text("name", "Project name")}
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
                options={PROJECT_STATUSES.map((status) => ({
                  value: status,
                  label: PROJECT_STATUS_LABELS[status],
                }))}
              />
            )}
          />
          {choice("customerId", "Customer", customers, "Optional — for customer work.")}
          {choice("managerId", "Manager", managers, "A current employee responsible for the project.")}
          {text("startDate", "Start date", { type: "date" })}
          {text("endDate", "End date", { type: "date" })}
          {text("budget", `Budget (${currency})`, { inputMode: "decimal", placeholder: "0.00" })}
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
          {projectId ? "Save changes" : "Create project"}
        </Button>
        <Button asChild variant="outline">
          <Link href={projectId ? `/projects/${projectId}` : "/projects"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
