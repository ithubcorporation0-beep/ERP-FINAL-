"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema } from "@/lib/validation";
import { forgotPasswordAction } from "@/server/actions/auth.actions";
import { FormStatus } from "./form-status";

type Values = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: Values) {
    const result = await forgotPasswordAction(values);
    if (result.ok) setSent(true);
    else applyActionError(form.setError, result, ["email"]);
  }

  if (sent) {
    return (
      <FormStatus
        tone="success"
        message="If an account exists for that email, we've sent a link to reset the password. It expires in 1 hour."
      />
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormField
          control={form.control}
          name="email"
          label="Email"
          render={({ field, control }) => <Input type="email" autoComplete="email" {...field} {...control} />}
        />
        <FormStatus tone="error" message={errors.root?.message} />
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Send reset link
        </Button>
      </FieldGroup>
    </form>
  );
}
