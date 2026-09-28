"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput } from "@/components/forms/select-input";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "@/config/accounting";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import { accountSchema, type AccountInput } from "@/lib/validation";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "@/server/actions/accounting.actions";

const FIELDS = ["code", "name", "type", "description"] as const;

interface AccountDialogProps {
  account?: AccountInput & { id: string; system: boolean; hasLines: boolean };
}

/** Add an account, or edit one (the type is fixed once it has transactions or for system accounts). */
export function AccountDialog({ account }: AccountDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: AccountInput = { code: "", name: "", type: "EXPENSE", description: "", isActive: true };
  const form = useForm<AccountInput>({
    resolver: zodResolver(accountSchema),
    defaultValues: account ?? empty,
  });
  const { errors, isSubmitting } = form.formState;
  const isActive = useWatch({ control: form.control, name: "isActive" });
  const typeLocked = account ? account.system || account.hasLines : false;

  async function onSubmit(values: AccountInput) {
    const result = account
      ? await updateAccountAction(account.id, values)
      : await createAccountAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success(account ? "Account updated." : "Account added.");
    setOpen(false);
    if (!account) form.reset(empty);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(account ?? empty);
      }}
      title={account ? `Edit ${account.code} ${account.name}` : "Add account"}
      description="Accounts group transactions in the ledger and the financial reports."
      trigger={
        account ? (
          <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${account.name}`}>
            <Pencil aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button">
            <Plus aria-hidden="true" />
            Add account
          </Button>
        )
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
          <FormField
            control={form.control}
            name="code"
            label="Code"
            required
            description="e.g. 6100. Codes sort the chart of accounts."
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="name"
            label="Name"
            required
            render={({ field, control }) => <Input {...field} {...control} />}
          />
          <FormField
            control={form.control}
            name="type"
            label="Type"
            required
            description={typeLocked ? "Fixed: system account or already has transactions." : undefined}
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                disabled={typeLocked}
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="description"
            label="Description"
            render={({ field, control }) => (
              <Textarea rows={2} {...field} value={field.value ?? ""} {...control} />
            )}
          />
          {account ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="account-active"
                checked={isActive !== false}
                onCheckedChange={(value) => form.setValue("isActive", value === true)}
              />
              <Label htmlFor="account-active">
                Active (inactive accounts can&apos;t be used in new transactions)
              </Label>
            </div>
          ) : null}
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {account ? "Save account" : "Add account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Delete an account that has no transactions (system accounts can't be deleted). */
export function DeleteAccountButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Delete"
      title={`Delete account ${name}?`}
      description="Only accounts without transactions can be deleted. This can't be undone."
      confirmLabel="Delete account"
      onConfirm={async () => {
        const result = await deleteAccountAction(id);
        if (!result.ok) throw new Error(result.error.message);
        toast.success("Account deleted.");
        router.refresh();
      }}
    />
  );
}
