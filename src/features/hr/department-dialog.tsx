"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { departmentSchema, type DepartmentInput } from "@/lib/validation";
import {
  createDepartmentAction,
  deleteDepartmentAction,
  updateDepartmentAction,
} from "@/server/actions/hr.actions";

/** Add a department, or edit one (rename, describe, deactivate). */
export function DepartmentDialog({ department }: { department?: DepartmentInput & { id: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: DepartmentInput = { name: "", description: "", isActive: true };
  const form = useForm<DepartmentInput>({
    resolver: zodResolver(departmentSchema),
    defaultValues: department ?? empty,
  });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: DepartmentInput) {
    const result = department
      ? await updateDepartmentAction(department.id, values)
      : await createDepartmentAction(values);
    if (!result.ok) return applyActionError(form.setError, result, ["name", "description"]);
    toast.success(department ? "Department updated." : "Department added.");
    setOpen(false);
    if (!department) form.reset(empty);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(department ?? empty);
      }}
      title={department ? `Edit ${department.name}` : "Add department"}
      trigger={
        department ? (
          <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${department.name}`}>
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button">
            <Plus aria-hidden="true" />
            Add department
          </Button>
        )
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            label="Name"
            required
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="description"
            label="Description"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          {department ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`department-active-${department.id}`}
                checked={isActive !== false}
                onCheckedChange={(value) => form.setValue("isActive", value === true)}
              />
              <Label htmlFor={`department-active-${department.id}`}>
                Active (inactive departments can&apos;t be chosen for new employees)
              </Label>
            </div>
          ) : null}
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {department ? "Save department" : "Add department"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Delete an empty department (after confirmation). */
export function DeleteDepartmentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Delete"
      title={`Delete department ${name}?`}
      description="Only departments without employees can be deleted. This can't be undone."
      confirmLabel="Delete department"
      onConfirm={async () => {
        const result = await deleteDepartmentAction(id);
        if (!result.ok) throw new Error(result.error.message);
        toast.success("Department deleted.");
        router.refresh();
      }}
    />
  );
}
