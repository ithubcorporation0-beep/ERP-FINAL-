"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerSchema, type RegisterInput } from "@/lib/validation";
import { registerAction } from "@/server/actions/auth.actions";
import { FormStatus } from "./form-status";

export function RegisterForm() {
  const [done, setDone] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { companyName: "", name: "", email: "", password: "", confirmPassword: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: RegisterInput) {
    const result = await registerAction(values);
    if (result.ok) setDone(true);
    else
      applyActionError(form.setError, result, [
        "companyName",
        "name",
        "email",
        "password",
        "confirmPassword",
      ]);
  }

  if (done) {
    return (
      <FormStatus
        tone="success"
        message="Check your inbox: we've sent a link to verify your email address. You can sign in once it's verified."
      />
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormField
          control={form.control}
          name="companyName"
          label="Company name"
          render={({ field, control }) => <Input autoComplete="organization" {...field} {...control} />}
        />
        <FormField
          control={form.control}
          name="name"
          label="Your name"
          render={({ field, control }) => <Input autoComplete="name" {...field} {...control} />}
        />
        <FormField
          control={form.control}
          name="email"
          label="Work email"
          render={({ field, control }) => <Input type="email" autoComplete="email" {...field} {...control} />}
        />
        <FormField
          control={form.control}
          name="password"
          label="Password"
          description="At least 12 characters. A short sentence works well."
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
          Create account
        </Button>
      </FieldGroup>
    </form>
  );
}
