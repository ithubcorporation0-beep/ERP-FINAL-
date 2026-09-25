"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginInput } from "@/lib/validation";
import { loginAction } from "@/server/actions/auth.actions";

export function LoginForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    const result = await loginAction(values);
    if (result?.error) setError("root", { message: result.error });
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1>Sign in</h1>
        </CardTitle>
        <CardDescription>Use your company account to continue.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={Boolean(errors.password)}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>
            {errors.root ? (
              <Alert variant="destructive">
                <AlertDescription>{errors.root.message}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
