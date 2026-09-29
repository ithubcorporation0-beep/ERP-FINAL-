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
import { FormStatus } from "@/features/auth/form-status";
import { employeeSchema, type EmployeeInput } from "@/lib/validation";
import { createEmployeeAction, updateEmployeeAction } from "@/server/actions/hr.actions";

const FIELDS = [
  "name",
  "email",
  "phone",
  "identificationNumber",
  "departmentId",
  "position",
  "joiningDate",
  "userId",
  "emergencyContactName",
  "emergencyContactRelation",
  "emergencyContactPhone",
  "notes",
  "status",
] as const;
const NONE = "none";

interface EmployeeFormProps {
  employeeId?: string;
  defaults: EmployeeInput;
  departments: SelectOption[];
  /** Company members the record can be linked to (for self-service attendance and leave). */
  members: SelectOption[];
}

/** Employee profile form. Salary and bank details are edited separately on the profile (restricted). */
export function EmployeeForm({ employeeId, defaults, departments, members }: EmployeeFormProps) {
  const router = useRouter();
  const form = useForm<EmployeeInput>({ resolver: zodResolver(employeeSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: EmployeeInput) {
    const result = employeeId
      ? await updateEmployeeAction(employeeId, values)
      : await createEmployeeAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    const id = employeeId ?? (result.data && "id" in result.data ? result.data.id : undefined);
    toast.success(employeeId ? "Employee updated." : "Employee added.");
    router.push(id ? `/hr/employees/${id}` : "/hr/employees");
    router.refresh();
  }

  const optional = (options: SelectOption[], label: string) => [{ value: NONE, label }, ...options];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-8">
      <fieldset className="space-y-4">
        <legend className="mb-3 font-medium">Profile</legend>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            <FormField
              control={form.control}
              name="name"
              label="Full name"
              required
              render={({ field, control }) => <Input autoComplete="off" {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="identificationNumber"
              label="CNIC / employee identification"
              description="National ID or another identification number."
              render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
            />
            <FormField
              control={form.control}
              name="email"
              label="Email"
              render={({ field, control }) => (
                <Input type="email" {...field} value={field.value ?? ""} {...control} />
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              label="Phone"
              render={({ field, control }) => (
                <Input type="tel" {...field} value={field.value ?? ""} {...control} />
              )}
            />
          </div>
        </FieldGroup>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 font-medium">Employment</legend>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
            <FormField
              control={form.control}
              name="departmentId"
              label="Department"
              render={({ field, control }) => (
                <SelectInput
                  {...control}
                  className="sm:w-full"
                  value={field.value || NONE}
                  onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                  options={optional(departments, "No department")}
                />
              )}
            />
            <FormField
              control={form.control}
              name="position"
              label="Position"
              render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
            />
            <FormField
              control={form.control}
              name="joiningDate"
              label="Joining date"
              required
              render={({ field, control }) => <Input type="date" {...field} {...control} />}
            />
            {employeeId ? null : (
              <FormField
                control={form.control}
                name="status"
                label="Employment status"
                description="Later changes go through “Change status” on the profile."
                render={({ field, control }) => (
                  <SelectInput
                    {...control}
                    className="sm:w-full"
                    value={field.value ?? "ACTIVE"}
                    onValueChange={field.onChange}
                    options={[
                      { value: "ACTIVE", label: "Active" },
                      { value: "PROBATION", label: "Probation" },
                    ]}
                  />
                )}
              />
            )}
            <FormField
              control={form.control}
              name="userId"
              label="Login"
              description="Links a member's login so they can check in and request leave."
              render={({ field, control }) => (
                <SelectInput
                  {...control}
                  className="sm:w-full"
                  value={field.value || NONE}
                  onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                  options={optional(members, "Not linked")}
                />
              )}
            />
          </div>
        </FieldGroup>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-3 font-medium">Emergency contact</legend>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
            <FormField
              control={form.control}
              name="emergencyContactName"
              label="Name"
              render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
            />
            <FormField
              control={form.control}
              name="emergencyContactRelation"
              label="Relationship"
              render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
            />
            <FormField
              control={form.control}
              name="emergencyContactPhone"
              label="Emergency phone"
              render={({ field, control }) => (
                <Input type="tel" {...field} value={field.value ?? ""} {...control} />
              )}
            />
          </div>
        </FieldGroup>
      </fieldset>

      <FormField
        control={form.control}
        name="notes"
        label="Notes"
        render={({ field, control }) => (
          <Textarea rows={3} {...field} value={field.value ?? ""} {...control} />
        )}
      />

      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {employeeId ? "Save employee" : "Add employee"}
        </Button>
        <Button asChild variant="outline">
          <Link href={employeeId ? `/hr/employees/${employeeId}` : "/hr/employees"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
