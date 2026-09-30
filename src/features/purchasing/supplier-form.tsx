"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import { supplierSchema, type SupplierInput } from "@/lib/validation";
import { createSupplierAction, updateSupplierAction } from "@/server/actions/purchasing.actions";

const FIELDS = ["name", "companyName", "phone", "email", "address", "taxId", "notes"] as const;

export function SupplierForm({ supplierId, defaults }: { supplierId?: string; defaults: SupplierInput }) {
  const router = useRouter();
  const form = useForm<SupplierInput>({ resolver: zodResolver(supplierSchema), defaultValues: defaults });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SupplierInput) {
    if (supplierId) {
      const result = await updateSupplierAction(supplierId, values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Supplier saved.");
      router.push(`/purchasing/suppliers/${supplierId}`);
    } else {
      const result = await createSupplierAction(values);
      if (!result.ok) return applyActionError(form.setError, result, FIELDS);
      toast.success("Supplier created.");
      router.push(`/purchasing/suppliers/${result.data.id}`);
    }
    router.refresh();
  }

  const text = (
    name: "name" | "companyName" | "phone" | "email" | "taxId",
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
          {text("phone", "Phone", { type: "tel", autoComplete: "tel" })}
          {text("email", "Email", { type: "email", autoComplete: "email" })}
          {text("taxId", "Tax information (tax / VAT / NTN number)")}
          <FormField
            control={form.control}
            name="address"
            label="Address"
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            label="Notes"
            className="md:col-span-2"
            render={({ field, control }) => (
              <Textarea rows={3} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          {supplierId ? (
            <div className="flex items-center gap-2 md:col-span-2">
              <Checkbox
                id="supplier-active"
                checked={isActive !== false}
                onCheckedChange={(value) => form.setValue("isActive", value === true)}
              />
              <Label htmlFor="supplier-active">Active (inactive suppliers can&apos;t get new orders)</Label>
            </div>
          ) : null}
        </div>
      </FieldGroup>
      <FormStatus tone="error" message={errors.root?.message} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {supplierId ? "Save changes" : "Create supplier"}
        </Button>
        <Button asChild variant="outline">
          <Link href={supplierId ? `/purchasing/suppliers/${supplierId}` : "/purchasing/suppliers"}>
            Cancel
          </Link>
        </Button>
      </div>
    </form>
  );
}
