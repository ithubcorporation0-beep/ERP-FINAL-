"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { PasswordInput } from "@/components/forms/password-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { loginAction } from "@/server/actions/auth.actions";
import { FormStatus } from "./form-status";

export function LoginForm({ next, notice }: { next?: string | null; notice?: string }) {
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: LoginInput) {
    const result = await loginAction(values, next ?? null);
    // On success the action redirects; only failures come back here.
    if (!result.ok) applyActionError(form.setError, result, ["email", "password"]);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormStatus tone="success" message={notice} />
        <FormField
          control={form.control}
          name="email"
          label="Email"
          render={({ field, control }) => <Input type="email" autoComplete="email" {...field} {...control} />}
        />
        <FormField
          control={form.control}
          name="password"
          label="Password"
          render={({ field, control }) => (
            <PasswordInput autoComplete="current-password" {...field} {...control} />
          )}
        />
        <div className="-mt-3 text-right text-sm">
          <Link href="/forgot-password" className="text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <FormStatus tone="error" message={errors.root?.message} />
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
