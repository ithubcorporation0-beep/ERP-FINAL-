"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation";
import { resetPasswordAction } from "@/server/actions/auth.actions";
import { FormStatus } from "./form-status";

export function ResetPasswordForm({ token }: { token: string }) {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ResetPasswordInput) {
    const result = await resetPasswordAction(values);
    if (!result.ok) applyActionError(form.setError, result, ["password", "confirmPassword"]);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormField
          control={form.control}
          name="password"
          label="New password"
          description="At least 12 characters. You'll be signed out on all devices."
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
        <FormStatus tone="error" message={errors.root?.message ?? errors.token?.message} />
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Set new password
        </Button>
      </FieldGroup>
    </form>
  );
}
