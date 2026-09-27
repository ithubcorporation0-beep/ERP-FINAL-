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
import { FormStatus } from "@/features/auth/form-status";
import type { ActionResult } from "@/lib/action";
import { salesDocumentSchema, type SalesDocumentInput } from "@/lib/validation";
import { createInvoiceAction, updateInvoiceAction } from "@/server/actions/invoice.actions";
import { createQuotationAction, updateQuotationAction } from "@/server/actions/quotation.actions";
import { LineItemsEditor } from "./line-items-editor";

const FIELDS = ["customerId", "leadId", "issueDate", "endDate", "items", "notes", "terms"] as const;

type Kind = "quotation" | "invoice";

const TEXT: Record<Kind, { issue: string; end: string; create: string; base: string; noun: string }> = {
  quotation: {
    issue: "Quotation date",
    end: "Valid until",
    create: "Save quotation",
    base: "/sales/quotations",
    noun: "Quotation",
  },
  invoice: {
    issue: "Invoice date",
    end: "Due date",
    create: "Save invoice",
    base: "/sales/invoices",
    noun: "Invoice",
  },
};

interface SalesDocumentFormProps {
  kind: Kind;
  /** Omit to create. */
  documentId?: string;
  defaults: SalesDocumentInput;
  customers: SelectOption[];
  currency: string;
  locale: string;
}

/** Create or edit a quotation or an invoice. The server validates and prices everything again. */
export function SalesDocumentForm({
  kind,
  documentId,
  defaults,
  customers,
  currency,
  locale,
}: SalesDocumentFormProps) {
  const router = useRouter();
  const text = TEXT[kind];
  const form = useForm<SalesDocumentInput>({
    resolver: zodResolver(salesDocumentSchema),
    defaultValues: defaults,
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SalesDocumentInput) {
    let result: ActionResult<{ id: string }>;
    if (documentId) {
      const updated =
        kind === "quotation"
          ? await updateQuotationAction(documentId, values)
          : await updateInvoiceAction(documentId, values);
      result = updated.ok ? { ok: true, data: { id: documentId } } : updated;
    } else {
      result = kind === "quotation" ? await createQuotationAction(values) : await createInvoiceAction(values);
    }
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success(`${text.noun} saved.`);
    router.push(`${text.base}/${result.data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
          <FormField
            control={form.control}
            name="customerId"
            label="Customer"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value || undefined}
                onValueChange={field.onChange}
                options={customers}
                placeholder="Choose a customer…"
              />
            )}
          />
          <FormField
            control={form.control}
            name="issueDate"
            label={text.issue}
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="endDate"
            label={text.end}
            required
            render={({ field, control }) => <Input type="date" {...field} {...control} />}
          />
        </div>
      </FieldGroup>

      <LineItemsEditor
        control={form.control}
        register={form.register}
        errors={errors}
        currency={currency}
        locale={locale}
      />

      <FieldGroup>
        <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          <FormField
            control={form.control}
            name="notes"
            label="Notes"
            description="Shown on the document."
            render={({ field, control }) => (
              <Textarea rows={3} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="terms"
            label="Terms and conditions"
            render={({ field, control }) => (
              <Textarea rows={3} {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </div>
      </FieldGroup>

      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {documentId ? "Save changes" : text.create}
        </Button>
        <Button asChild variant="outline">
          <Link href={documentId ? `${text.base}/${documentId}` : text.base}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
