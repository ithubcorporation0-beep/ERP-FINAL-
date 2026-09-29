"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAY_LABELS } from "@/config/hr";
import { FormStatus } from "@/features/auth/form-status";
import { workScheduleSchema, type WorkScheduleInput } from "@/lib/validation";
import { updateWorkScheduleAction } from "@/server/actions/hr.actions";

const FIELDS = ["workdayStart", "workdayEnd", "lateGraceMinutes", "halfDayMinutes", "workDays"] as const;

/** Working days and hours used by attendance (late, early departure, half day) and leave day counts. */
export function WorkScheduleForm({ defaults, readOnly }: { defaults: WorkScheduleInput; readOnly: boolean }) {
  const form = useForm<WorkScheduleInput>({
    resolver: zodResolver(workScheduleSchema),
    defaultValues: defaults,
  });
  const workDays = useWatch({ control: form.control, name: "workDays" });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: WorkScheduleInput) {
    const result = await updateWorkScheduleAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success("Work schedule saved.");
    form.reset(values);
  }

  function toggleDay(day: number, on: boolean) {
    const next = on ? [...workDays, day] : workDays.filter((value) => value !== day);
    form.setValue(
      "workDays",
      [...new Set(next)].sort((a, b) => a - b),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <fieldset disabled={readOnly} className="contents">
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-4">
            <FormField
              control={form.control}
              name="workdayStart"
              label="Workday starts"
              render={({ field, control }) => <Input type="time" {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="workdayEnd"
              label="Workday ends"
              render={({ field, control }) => <Input type="time" {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="lateGraceMinutes"
              label="Late after (minutes)"
              description="Grace period after the start."
              render={({ field, control }) => (
                <Input
                  type="number"
                  min={0}
                  max={240}
                  {...field}
                  onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  {...control}
                />
              )}
            />
            <FormField
              control={form.control}
              name="halfDayMinutes"
              label="Half day under (minutes)"
              description="Worked less than this = half day."
              render={({ field, control }) => (
                <Input
                  type="number"
                  min={0}
                  max={720}
                  {...field}
                  onChange={(event) => field.onChange(event.target.valueAsNumber)}
                  {...control}
                />
              )}
            />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Working days</legend>
            <div className="flex flex-wrap gap-4">
              {WEEKDAY_LABELS.map((label, day) => (
                <div key={label} className="flex items-center gap-2">
                  <Checkbox
                    id={`workday-${day}`}
                    checked={workDays.includes(day)}
                    onCheckedChange={(value) => toggleDay(day, value === true)}
                  />
                  <Label htmlFor={`workday-${day}`}>{label}</Label>
                </div>
              ))}
            </div>
            {errors.workDays?.message ? (
              <p role="alert" className="mt-2 text-sm text-danger">
                {errors.workDays.message}
              </p>
            ) : null}
          </fieldset>
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        {readOnly ? null : (
          <div className="mt-4">
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save work schedule
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
