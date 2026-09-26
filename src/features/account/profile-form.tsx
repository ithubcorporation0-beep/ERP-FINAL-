"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormStatus } from "@/features/auth/form-status";
import { profileSchema, type ProfileInput } from "@/lib/validation";
import { updateProfileAction } from "@/server/actions/account.actions";

type Values = ProfileInput;

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; phone: string | null; jobTitle: string | null };
}) {
  const form = useForm<Values>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: defaults.name, phone: defaults.phone ?? "", jobTitle: defaults.jobTitle ?? "" },
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: Values) {
    const result = await updateProfileAction(values);
    if (result.ok) {
      toast.success("Profile saved.");
      form.reset(values);
    } else applyActionError(form.setError, result, ["name", "phone", "jobTitle"]);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <FormField
          control={form.control}
          name="name"
          label="Full name"
          required
          render={({ field, control }) => <Input autoComplete="name" {...field} {...control} />}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="jobTitle"
            label="Job title"
            render={({ field, control }) => (
              <Input autoComplete="organization-title" {...field} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            label="Phone"
            render={({ field, control }) => <Input type="tel" autoComplete="tel" {...field} {...control} />}
          />
        </div>
        <FormStatus tone="error" message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save profile
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
