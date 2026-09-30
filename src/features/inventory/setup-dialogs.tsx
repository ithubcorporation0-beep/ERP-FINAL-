"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import {
  productCategorySchema,
  warehouseSchema,
  type ProductCategoryInput,
  type WarehouseInput,
} from "@/lib/validation";
import {
  createCategoryAction,
  createWarehouseAction,
  deleteCategoryAction,
  deleteWarehouseAction,
  updateCategoryAction,
  updateWarehouseAction,
} from "@/server/actions/inventory.actions";

/**
 * The button that opens a dialog. It is rendered through the dialog trigger's `asChild`, so it must pass the injected
 * props (click handler, ref, aria attributes) on to the real button.
 */
function TriggerButton({
  editing,
  noun,
  name,
  ...props
}: { editing: boolean; noun: string; name?: string } & React.ComponentProps<typeof Button>) {
  return editing ? (
    <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${name ?? noun}`} {...props}>
      <Pencil aria-hidden="true" />
    </Button>
  ) : (
    <Button type="button" {...props}>
      <Plus aria-hidden="true" />
      Add {noun}
    </Button>
  );
}

function DialogButtons({ busy, label, onCancel }: { busy: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {label}
      </Button>
    </div>
  );
}

/** Add a warehouse, or edit one (rename, address, deactivate). */
export function WarehouseDialog({ warehouse }: { warehouse?: WarehouseInput & { id: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: WarehouseInput = { name: "", address: "", isActive: true };
  const form = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: warehouse ?? empty,
  });
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: WarehouseInput) {
    const result = warehouse
      ? await updateWarehouseAction(warehouse.id, values)
      : await createWarehouseAction(values);
    if (!result.ok) return applyActionError(form.setError, result, ["name", "address"]);
    toast.success(warehouse ? "Warehouse updated." : "Warehouse added.");
    setOpen(false);
    if (!warehouse) form.reset(empty);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(warehouse ?? empty);
      }}
      title={warehouse ? `Edit ${warehouse.name}` : "Add warehouse"}
      trigger={<TriggerButton editing={Boolean(warehouse)} noun="warehouse" name={warehouse?.name} />}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            label="Name"
            required
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="address"
            label="Address"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          {warehouse ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`warehouse-active-${warehouse.id}`}
                checked={isActive !== false}
                onCheckedChange={(value) => form.setValue("isActive", value === true)}
              />
              <Label htmlFor={`warehouse-active-${warehouse.id}`}>
                Active (inactive warehouses can&apos;t receive new stock movements)
              </Label>
            </div>
          ) : null}
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        <DialogButtons
          busy={isSubmitting}
          label={warehouse ? "Save warehouse" : "Add warehouse"}
          onCancel={() => setOpen(false)}
        />
      </form>
    </Modal>
  );
}

/** Add or rename a product category. */
export function CategoryDialog({ category }: { category?: ProductCategoryInput & { id: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: ProductCategoryInput = { name: "", description: "" };
  const form = useForm<ProductCategoryInput>({
    resolver: zodResolver(productCategorySchema),
    defaultValues: category ?? empty,
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ProductCategoryInput) {
    const result = category
      ? await updateCategoryAction(category.id, values)
      : await createCategoryAction(values);
    if (!result.ok) return applyActionError(form.setError, result, ["name", "description"]);
    toast.success(category ? "Category updated." : "Category added.");
    setOpen(false);
    if (!category) form.reset(empty);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(category ?? empty);
      }}
      title={category ? `Edit ${category.name}` : "Add category"}
      trigger={<TriggerButton editing={Boolean(category)} noun="category" name={category?.name} />}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="name"
            label="Name"
            required
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="description"
            label="Description"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        <DialogButtons
          busy={isSubmitting}
          label={category ? "Save category" : "Add category"}
          onCancel={() => setOpen(false)}
        />
      </form>
    </Modal>
  );
}

/** Delete an unused warehouse or category (after confirmation). */
export function DeleteSetupButton({
  kind,
  id,
  name,
}: {
  kind: "warehouse" | "category";
  id: string;
  name: string;
}) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Delete"
      title={`Delete ${kind} ${name}?`}
      description={
        kind === "warehouse"
          ? "Only warehouses without stock history, products or purchase orders can be deleted. This can't be undone."
          : "Only categories no product uses can be deleted. This can't be undone."
      }
      confirmLabel={`Delete ${kind}`}
      onConfirm={async () => {
        const result =
          kind === "warehouse" ? await deleteWarehouseAction(id) : await deleteCategoryAction(id);
        if (!result.ok) throw new Error(result.error.message);
        toast.success(kind === "warehouse" ? "Warehouse deleted." : "Category deleted.");
        router.refresh();
      }}
    />
  );
}
