"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_SOURCE_LABELS, LEAD_SOURCES, LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/config/crm";
import { FormStatus } from "@/features/auth/form-status";
import { leadSchema, type LeadInput } from "@/lib/validation";
import { createLeadAction, updateLeadAction } from "@/server/actions/lead.actions";
import { optionsOf } from "./labels";

const FIELDS = [
  "name",
  "companyName",
  "email",
  "phone",
  "source",
  "assignedToId",
  "status",
  "expectedValue",
  "notes",
  "followUpDate",
] as const;

const UNASSIGNED = "none";

export const EMPTY_LEAD: LeadInput = {
  name: "",
  companyName: "",
  email: "",
  phone: "",
  source: "OTHER",
  assignedToId: "",
  status: "NEW",
  expectedValue: "",
  notes: "",
  followUpDate: "",
};

interface LeadFormProps {
  leadId?: string;
  defaults: LeadInput;
  assignees: SelectOption[];
  currency: string;
}

export function LeadForm({ leadId, defaults, assignees, currency }: LeadFormProps) {
  const router = useRouter();
  const form = useForm<LeadInput>({ resolver: zodResolver(leadSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: LeadInput) {
    if (leadId) {
      const result = await updateLeadAction(leadId, values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Lead saved.");
      router.push(`/crm/leads/${leadId}`);
    } else {
      const result = await createLeadAction(values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Lead created.");
      router.push(`/crm/leads/${result.data.id}`);
    }
    router.refresh();
  }

  const text = (
    name: (typeof FIELDS)[number],
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      required={name === "name"}
      render={({ field, control }) => <Input {...props} {...field} value={field.value ?? ""} {...control} />}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2">
          {text("name", "Name", { autoComplete: "name" })}
          {text("companyName", "Company", { autoComplete: "organization" })}
          {text("email", "Email", { type: "email", autoComplete: "email" })}
          {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
          <FormField
            control={form.control}
            name="source"
            label="Source"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(LEAD_SOURCES, LEAD_SOURCE_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="status"
            label="Status"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(LEAD_STATUSES, LEAD_STATUS_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="assignedToId"
            label="Assigned to"
            description="Any active member of your company."
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || UNASSIGNED}
                onValueChange={(value) => field.onChange(value === UNASSIGNED ? "" : value)}
                options={[{ value: UNASSIGNED, label: "Unassigned" }, ...assignees]}
              />
            )}
          />
          {text("expectedValue", `Expected value (${currency})`, {
            inputMode: "decimal",
            placeholder: "0.00",
          })}
          {text("followUpDate", "Follow-up date", { type: "date" })}
          <FormField
            control={form.control}
            name="notes"
            label="Notes"
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={4} {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </div>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {leadId ? "Save changes" : "Create lead"}
        </Button>
        <Button asChild variant="outline">
          <Link href={leadId ? `/crm/leads/${leadId}` : "/crm/leads"}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
