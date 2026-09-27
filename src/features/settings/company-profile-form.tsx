"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { FormStatus } from "@/features/auth/form-status";
import type { Option } from "@/lib/intl";
import { companyProfileSchema, type CompanyProfileInput } from "@/lib/validation";
import { updateCompanyProfileAction } from "@/server/actions/company.actions";

interface CompanyProfileFormProps {
  defaults: CompanyProfileInput;
  readOnly: boolean;
  options: {
    countries: Option[];
    currencies: Option[];
    timeZones: Option[];
    locales: Option[];
    months: Option[];
  };
}

const FIELDS = [
  "name",
  "legalName",
  "taxId",
  "email",
  "phone",
  "address",
  "country",
  "baseCurrency",
  "timezone",
  "locale",
  "fiscalYearStartMonth",
] as const;

export function CompanyProfileForm({ defaults, readOnly, options }: CompanyProfileFormProps) {
  const router = useRouter();
  const form = useForm<CompanyProfileInput>({
    resolver: zodResolver(companyProfileSchema),
    defaultValues: defaults,
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: CompanyProfileInput) {
    const result = await updateCompanyProfileAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success("Company profile saved.");
    form.reset(values);
    router.refresh();
  }

  const select = (
    name: "country" | "baseCurrency" | "timezone" | "locale",
    label: string,
    list: Option[],
    required = true,
  ) => (
    <FormField
      control={form.control}
      name={name}
      label={label}
      required={required}
      render={({ field, control }) => (
        <SelectInput
          {...control}
          className="sm:w-full"
          value={field.value}
          onValueChange={field.onChange}
          options={list}
          disabled={readOnly}
          placeholder="Select…"
        />
      )}
    />
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <fieldset disabled={readOnly} className="contents">
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              label="Company name"
              required
              render={({ field, control }) => <Input autoComplete="organization" {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="legalName"
              label="Legal name"
              description="As registered, for invoices and contracts."
              render={({ field, control }) => <Input {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="taxId"
              label="Tax / VAT number"
              render={({ field, control }) => <Input {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="email"
              label="Company email"
              render={({ field, control }) => <Input type="email" {...field} {...control} />}
            />
            <FormField
              control={form.control}
              name="phone"
              label="Phone"
              render={({ field, control }) => <Input type="tel" {...field} {...control} />}
            />
            {select("country", "Country", options.countries, false)}
          </div>
          <FormField
            control={form.control}
            name="address"
            label="Address"
            render={({ field, control }) => <Textarea rows={2} {...field} {...control} />}
          />
          <div className="grid gap-4 md:grid-cols-2">
            {select("baseCurrency", "Base currency", options.currencies)}
            {select("timezone", "Time zone", options.timeZones)}
            {select("locale", "Number and date format", options.locales)}
            <FormField
              control={form.control}
              name="fiscalYearStartMonth"
              label="Fiscal year starts in"
              required
              render={({ field, control }) => (
                <SelectInput
                  {...control}
                  className="sm:w-full"
                  value={String(field.value)}
                  onValueChange={(value) => field.onChange(Number(value))}
                  options={options.months}
                  disabled={readOnly}
                />
              )}
            />
          </div>
          <FormStatus tone="error" message={errors.root?.message} />
          {readOnly ? null : (
            <div>
              <Button type="submit" disabled={isSubmitting || !isDirty} aria-busy={isSubmitting}>
                {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Save company profile
              </Button>
            </div>
          )}
        </FieldGroup>
      </fieldset>
    </form>
  );
}
