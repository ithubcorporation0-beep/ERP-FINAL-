"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { FormStatus } from "@/features/auth/form-status";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation";
import { changePasswordAction } from "@/server/actions/account.actions";

const EMPTY: ChangePasswordInput = { currentPassword: "", password: "", confirmPassword: "" };

export function ChangePasswordForm() {
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: EMPTY,
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ChangePasswordInput) {
    const result = await changePasswordAction(values);
    if (result.ok) {
      toast.success("Password changed. Your other sessions were signed out.");
      form.reset(EMPTY);
    } else applyActionError(form.setError, result, ["currentPassword", "password", "confirmPassword"]);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormField
          control={form.control}
          name="currentPassword"
          label="Current password"
          render={({ field, control }) => (
            <PasswordInput autoComplete="current-password" {...field} {...control} />
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="password"
            label="New password"
            description="At least 12 characters."
            render={({ field, control }) => (
              <PasswordInput autoComplete="new-password" {...field} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            label="Repeat new password"
            render={({ field, control }) => (
              <PasswordInput autoComplete="new-password" {...field} {...control} />
            )}
          />
        </div>
        <FormStatus tone="error" message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Change password
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
