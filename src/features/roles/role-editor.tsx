"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { roleSchema, type RoleInput } from "@/lib/validation";
import { createRoleAction, updateRoleAction } from "@/server/actions/role.actions";
import { PermissionMatrix } from "./permission-matrix";

interface RoleEditorProps {
  /** Omit to create a new role. */
  roleId?: string;
  defaults: RoleInput;
  /** The editor's own permissions — the most they can grant. */
  grantable: string[];
}

export function RoleEditor({ roleId, defaults, grantable }: RoleEditorProps) {
  const router = useRouter();
  const [permissions, setPermissions] = useState(() => new Set(defaults.permissions));
  const grantableSet = useMemo(() => new Set(grantable), [grantable]);
  const form = useForm<RoleInput>({ resolver: zodResolver(roleSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: RoleInput) {
    const input = { ...values, permissions: [...permissions] };
    const result = roleId ? await updateRoleAction(roleId, input) : await createRoleAction(input);
    // Creating redirects to the new role on success.
    if (!result.ok) return applyActionError(form.setError, result, ["name", "description"]);
    toast.success("Role saved.");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup className="max-w-xl">
        <FormField
          control={form.control}
          name="name"
          label="Role name"
          required
          render={({ field, control }) => <Input {...field} {...control} />}
        />
        <FormField
          control={form.control}
          name="description"
          label="Description"
          render={({ field, control }) => <Textarea rows={2} {...field} {...control} />}
        />
      </FieldGroup>
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Permissions</h2>
        <p className="text-sm text-muted-foreground">
          {permissions.size} selected. Greyed-out boxes are permissions you don&apos;t have yourself, so you
          can&apos;t grant them.
        </p>
        <PermissionMatrix selected={permissions} grantable={grantableSet} onChange={setPermissions} />
      </div>
      <FormStatus tone="error" message={errors.root?.message} />
      <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {roleId ? "Save changes" : "Create role"}
      </Button>
    </form>
  );
}
