"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput } from "@/components/forms/select-input";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUSES,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
} from "@/config/crm";
import { FormStatus } from "@/features/auth/form-status";
import type { Option } from "@/lib/intl";
import { customerSchema, type CustomerInput } from "@/lib/validation";
import { createCustomerAction, updateCustomerAction } from "@/server/actions/customer.actions";
import { optionsOf } from "./labels";

const FIELDS = [
  "name",
  "companyName",
  "email",
  "phone",
  "whatsapp",
  "address",
  "city",
  "country",
  "taxId",
  "type",
  "status",
  "notes",
] as const;

interface CustomerFormProps {
  /** Omit to create a new customer. */
  customerId?: string;
  defaults: CustomerInput;
  countries: Option[];
}

export function CustomerForm({ customerId, defaults, countries }: CustomerFormProps) {
  const router = useRouter();
  const form = useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: defaults });
  const { errors, isSubmitting } = form.formState;
  const cancelHref = customerId ? `/crm/customers/${customerId}` : "/crm/customers";

  async function onSubmit(values: CustomerInput) {
    if (customerId) {
      const result = await updateCustomerAction(customerId, values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Customer saved.");
      router.push(`/crm/customers/${customerId}`);
    } else {
      const result = await createCustomerAction(values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Customer created.");
      router.push(`/crm/customers/${result.data.id}`);
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
          <FormField
            control={form.control}
            name="type"
            label="Customer type"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS)}
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
                options={optionsOf(CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS)}
              />
            )}
          />
          {text("email", "Email", { type: "email", autoComplete: "email" })}
          {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
          {text("whatsapp", "WhatsApp", { type: "tel" })}
          {text("taxId", "Tax number")}
          <FormField
            control={form.control}
            name="address"
            label="Address"
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea
                rows={2}
                autoComplete="street-address"
                {...field}
                value={field.value ?? ""}
                {...control}
              />
            )}
          />
          {text("city", "City", { autoComplete: "address-level2" })}
          <FormField
            control={form.control}
            name="country"
            label="Country"
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || undefined}
                onValueChange={field.onChange}
                options={countries}
                placeholder="Select a country…"
              />
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            label="Notes"
            description="Internal notes about this customer. Use the Communication tab to log calls and messages."
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
          {customerId ? "Save changes" : "Create customer"}
        </Button>
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
