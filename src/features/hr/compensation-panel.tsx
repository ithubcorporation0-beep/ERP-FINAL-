"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, Lock, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormStatus } from "@/features/auth/form-status";
import { DetailList } from "@/features/crm/detail-list";
import { compensationSchema, type CompensationInput } from "@/lib/validation";
import { revealBankDetailsAction, updateCompensationAction } from "@/server/actions/hr.actions";

const FIELDS = ["salary", "bankName", "accountTitle", "accountNumber", "iban"] as const;

export interface CompensationView {
  /** Exact decimal string, or "" when not set. */
  salary: string;
  /** Preformatted for display, e.g. "PKR 185,000.50". */
  salaryLabel: string | null;
  currency: string;
  bankName: string | null;
  accountTitle: string | null;
  /** Masked, e.g. "•••• 8901". */
  accountNumber: string | null;
  iban: string | null;
  updated: string | null;
}

/**
 * Salary and bank details, shown only to people with `salaries:view` (the page doesn't even load them otherwise).
 * Bank numbers are masked; "Show full numbers" asks the server, which records the view in the audit log.
 */
export function CompensationPanel({
  employeeId,
  view,
  canEdit,
}: {
  employeeId: string;
  view: CompensationView;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<{ accountNumber: string | null; iban: string | null } | null>(
    null,
  );
  const [revealing, setRevealing] = useState(false);
  const [open, setOpen] = useState(false);
  const defaults: CompensationInput = {
    salary: view.salary,
    bankName: view.bankName ?? "",
    accountTitle: view.accountTitle ?? "",
    accountNumber: "",
    iban: "",
    removeAccountNumber: false,
    removeIban: false,
  };
  const form = useForm<CompensationInput>({
    resolver: zodResolver(compensationSchema),
    defaultValues: defaults,
  });
  const [removeAccount, removeIban] = useWatch({
    control: form.control,
    name: ["removeAccountNumber", "removeIban"],
  });
  const { errors, isSubmitting } = form.formState;

  async function reveal() {
    if (revealed) return setRevealed(null);
    setRevealing(true);
    const result = await revealBankDetailsAction(employeeId);
    setRevealing(false);
    if (!result.ok) return toast.error(result.error.message);
    setRevealed(result.data);
  }

  async function onSubmit(values: CompensationInput) {
    const result = await updateCompensationAction(employeeId, values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success("Salary and bank details saved.");
    setOpen(false);
    setRevealed(null);
    form.reset({ ...values, accountNumber: "", iban: "", removeAccountNumber: false, removeIban: false });
    router.refresh();
  }

  const hasBankNumbers = Boolean(view.accountNumber || view.iban);

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        Restricted: visible only with the “Salary & bank details” permission. Bank numbers are encrypted.
      </p>
      <DetailList
        items={[
          { label: "Monthly salary", value: view.salaryLabel },
          { label: "Bank", value: view.bankName },
          { label: "Account title", value: view.accountTitle },
          {
            label: "Account number",
            value: revealed ? (
              <span className="font-mono">{revealed.accountNumber ?? "—"}</span>
            ) : (
              view.accountNumber
            ),
          },
          {
            label: "IBAN",
            value: revealed ? <span className="font-mono">{revealed.iban ?? "—"}</span> : view.iban,
          },
          { label: "Last updated", value: view.updated },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {hasBankNumbers ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void reveal()}
            disabled={revealing}
          >
            {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {revealed ? "Hide numbers" : "Show full numbers"}
          </Button>
        ) : null}
        {canEdit ? (
          <Modal
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) form.reset(defaults);
            }}
            title="Salary and bank details"
            description="Leave account number and IBAN empty to keep the stored ones."
            trigger={
              <Button type="button" size="sm">
                <Pencil aria-hidden="true" />
                Edit salary & bank
              </Button>
            }
          >
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
              <FieldGroup>
                <FormField
                  control={form.control}
                  name="salary"
                  label={`Monthly salary (${view.currency})`}
                  render={({ field, control }) => (
                    <Input
                      inputMode="decimal"
                      placeholder="0.00"
                      autoComplete="off"
                      {...field}
                      {...control}
                    />
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankName"
                  label="Bank"
                  render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
                />
                <FormField
                  control={form.control}
                  name="accountTitle"
                  label="Account title"
                  render={({ field, control }) => <Input {...field} value={field.value ?? ""} {...control} />}
                />
                <FormField
                  control={form.control}
                  name="accountNumber"
                  label="Account number"
                  description={view.accountNumber ? `Stored: ${view.accountNumber}` : undefined}
                  render={({ field, control }) => (
                    <Input
                      autoComplete="off"
                      disabled={removeAccount === true}
                      {...field}
                      value={field.value ?? ""}
                      {...control}
                    />
                  )}
                />
                {view.accountNumber ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remove-account"
                      checked={removeAccount === true}
                      onCheckedChange={(value) => form.setValue("removeAccountNumber", value === true)}
                    />
                    <Label htmlFor="remove-account">Remove the stored account number</Label>
                  </div>
                ) : null}
                <FormField
                  control={form.control}
                  name="iban"
                  label="IBAN"
                  description={view.iban ? `Stored: ${view.iban}` : undefined}
                  render={({ field, control }) => (
                    <Input
                      autoComplete="off"
                      disabled={removeIban === true}
                      {...field}
                      value={field.value ?? ""}
                      {...control}
                    />
                  )}
                />
                {view.iban ? (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remove-iban"
                      checked={removeIban === true}
                      onCheckedChange={(value) => form.setValue("removeIban", value === true)}
                    />
                    <Label htmlFor="remove-iban">Remove the stored IBAN</Label>
                  </div>
                ) : null}
              </FieldGroup>
              <FormStatus tone="error" message={errors.root?.message} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Save
                </Button>
              </div>
            </form>
          </Modal>
        ) : null}
      </div>
    </div>
  );
}
