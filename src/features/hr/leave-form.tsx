"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LEAVE_TYPE_LABELS, LEAVE_TYPES } from "@/config/hr";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import { apiErrorMessage } from "@/lib/api-client";
import { leaveSchema, type LeaveInput } from "@/lib/validation";
import { createLeaveAction } from "@/server/actions/hr.actions";

const FIELDS = ["employeeId", "type", "startDate", "endDate", "reason"] as const;
const SELF = "self";

/** Request leave. HR may file for someone else; an attachment (e.g. a medical certificate) is uploaded after saving. */
export function LeaveForm({ defaults, employees }: { defaults: LeaveInput; employees: SelectOption[] }) {
  const router = useRouter();
  const attachmentId = useId();
  const [attachment, setAttachment] = useState<File | null>(null);
  const form = useForm<LeaveInput>({ resolver: zodResolver(leaveSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: LeaveInput) {
    const result = await createLeaveAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    const id = result.data?.id;
    if (!id) return;
    if (attachment) {
      const body = new FormData();
      body.append("file", attachment);
      const response = await fetch(`/api/leaves/${id}/attachment`, { method: "POST", body });
      if (!response.ok)
        toast.error(`Request saved, but the attachment failed: ${await apiErrorMessage(response, "Upload")}`);
    }
    toast.success("Leave requested — waiting for approval.");
    router.push(`/hr/leave/${id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          {employees.length > 0 ? (
            <FormField
              control={form.control}
              name="employeeId"
              label="Employee"
              render={({ field, control }) => (
                <SelectInput
                  {...control}
                  className="sm:w-full"
                  value={field.value || SELF}
                  onValueChange={(value) => field.onChange(value === SELF ? "" : value)}
                  options={[{ value: SELF, label: "Me" }, ...employees]}
                />
              )}
            />
          ) : null}
          <FormField
            control={form.control}
            name="type"
            label="Leave type"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(LEAVE_TYPES, LEAVE_TYPE_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="startDate"
            label="Start date"
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="endDate"
            label="End date"
            required
            description="Only working days in the company schedule are counted."
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="reason"
            label="Reason"
            required
            className="md:col-span-2"
            render={({ field, control }) => <Textarea rows={3} {...field} {...control} />}
          />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={attachmentId}>Attachment</Label>
            <Input
              id={attachmentId}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
              onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">
              Optional, e.g. a medical certificate. Up to 10 MB.
            </p>
          </div>
        </div>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Request leave
        </Button>
        <Button asChild variant="outline">
          <Link href="/hr/leave">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
