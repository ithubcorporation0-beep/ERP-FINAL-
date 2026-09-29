"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { attendanceEntrySchema, type AttendanceEntryInput } from "@/lib/validation";
import { saveAttendanceEntryAction } from "@/server/actions/hr.actions";

const FIELDS = ["employeeId", "date", "checkIn", "checkOut", "note"] as const;

/**
 * HR enters or corrects one employee-day. Times are in the company time zone; late, early and half-day are
 * worked out on the server with the company's work schedule.
 */
export function AttendanceEntryForm({
  defaults,
  employees,
  timeZone,
}: {
  defaults: AttendanceEntryInput;
  employees: SelectOption[];
  timeZone: string;
}) {
  const router = useRouter();
  const form = useForm<AttendanceEntryInput>({
    resolver: zodResolver(attendanceEntrySchema),
    defaultValues: defaults,
  });
  const absent = useWatch({ control: form.control, name: "absent" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: AttendanceEntryInput) {
    const result = await saveAttendanceEntryAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success("Attendance saved.");
    router.push("/hr/attendance");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <FormField
            control={form.control}
            name="employeeId"
            label="Employee"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                placeholder="Choose an employee"
                value={field.value}
                onValueChange={field.onChange}
                options={employees}
              />
            )}
          />
          <FormField
            control={form.control}
            name="date"
            label="Date"
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <div className="flex items-center gap-2 md:col-span-2">
            <Checkbox
              id="attendance-absent"
              checked={absent}
              onCheckedChange={(value) => form.setValue("absent", value === true)}
            />
            <Label htmlFor="attendance-absent">Absent (no check-in)</Label>
          </div>
          {absent ? null : (
            <>
              <FormField
                control={form.control}
                name="checkIn"
                label={`Check-in time (${timeZone})`}
                required
                render={({ field, control }) => <Input type="time" {...field} {...control} />}
              />
              <FormField
                control={form.control}
                name="checkOut"
                label={`Check-out time (${timeZone})`}
                description="Leave empty if the employee hasn't left yet."
                render={({ field, control }) => <Input type="time" {...field} {...control} />}
              />
            </>
          )}
          <FormField
            control={form.control}
            name="note"
            label="Note"
            description="Required when correcting a day the employee recorded themselves."
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </div>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Save attendance
        </Button>
        <Button asChild variant="outline">
          <Link href="/hr/attendance">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
