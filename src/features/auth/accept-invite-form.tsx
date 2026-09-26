"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { acceptInvitationSchema, type AcceptInvitationInput } from "@/lib/validation";
import { acceptInvitationAction } from "@/server/actions/auth.actions";
import { FormStatus } from "./form-status";

export function AcceptInviteForm({ token, name, email }: { token: string; name: string; email: string }) {
  const form = useForm<AcceptInvitationInput>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { token, name, password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: AcceptInvitationInput) {
    const result = await acceptInvitationAction(values);
    if (!result.ok) applyActionError(form.setError, result, ["name", "password", "confirmPassword"]);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <p className="text-sm text-muted-foreground">
          Signing in as <span className="font-medium text-foreground">{email}</span>
        </p>
        <FormField
          control={form.control}
          name="name"
          label="Your name"
          render={({ field, control }) => <Input autoComplete="name" {...field} {...control} />}
        />
        <FormField
          control={form.control}
          name="password"
          label="Choose a password"
          description="At least 12 characters."
          render={({ field, control }) => (
            <PasswordInput autoComplete="new-password" {...field} {...control} />
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          label="Repeat password"
          render={({ field, control }) => (
            <PasswordInput autoComplete="new-password" {...field} {...control} />
          )}
        />
        <FormStatus tone="error" message={errors.root?.message} />
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Accept invitation
        </Button>
      </FieldGroup>
    </form>
  );
}
