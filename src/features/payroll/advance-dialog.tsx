"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { applyActionError } from "@/components/forms/action-errors";
import { FormField } from "@/components/forms/form-field";
import { SelectInput, type SelectOption } from "@/components/forms/select-input";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { Modal } from "@/components/shared/modal";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/config/sales";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import { salaryAdvanceSchema, type SalaryAdvanceInput } from "@/lib/validation";
import { cancelAdvanceAction, createAdvanceAction } from "@/server/actions/payroll.actions";

const FIELDS = ["employeeId", "amount", "advanceDate", "paymentMethod", "reason"] as const;

/** Records an advance paid to an employee; it is posted to the ledger and recovered by the next payroll. */
export function AdvanceDialog({ employees, today }: { employees: SelectOption[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty: SalaryAdvanceInput = {
    employeeId: "",
    amount: "",
    advanceDate: today,
    paymentMethod: "BANK_TRANSFER",
    reason: "",
  };
  const form = useForm<SalaryAdvanceInput>({
    resolver: zodResolver(salaryAdvanceSchema),
    defaultValues: empty,
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SalaryAdvanceInput) {
    const result = await createAdvanceAction(values);
    if (!result.ok) return applyActionError(form.setError, result, FIELDS);
    toast.success("Advance recorded.");
    setOpen(false);
    form.reset(empty);
    router.refresh();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(empty);
      }}
      title="Record salary advance"
      description="Paid now and posted to the accounts; recovered in full from the next payroll that has room for it."
      trigger={
        <Button type="button">
          <Plus aria-hidden="true" />
          Record advance
        </Button>
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        <FieldGroup>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="amount"
              label="Amount"
              required
              render={({ field, control }) => (
                <Input inputMode="decimal" placeholder="0.00" {...field} {...control} />
              )}
            />
            <FormField
              control={form.control}
              name="advanceDate"
              label="Date paid"
              required
              render={({ field, control }) => <Input type="date" max={today} {...field} {...control} />}
            />
          </div>
          <FormField
            control={form.control}
            name="paymentMethod"
            label="Paid with"
            required
            render={({ field, control }) => (
              <SelectInput
                {...control}
                className="sm:w-full"
                value={field.value}
                onValueChange={field.onChange}
                options={optionsOf(PAYMENT_METHODS, PAYMENT_METHOD_LABELS)}
              />
            )}
          />
          <FormField
            control={form.control}
            name="reason"
            label="Reason"
            required
            render={({ field, control }) => <Textarea rows={2} {...field} {...control} />}
          />
        </FieldGroup>
        <FormStatus tone="error" message={errors.root?.message} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Record advance
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Cancels an outstanding advance after confirmation (the posting is reversed). */
export function CancelAdvanceButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Cancel"
      title={`Cancel advance ${code}?`}
      description="Use this when the money was returned. The accounting entry is reversed; this can't be undone."
      confirmLabel="Cancel advance"
      cancelLabel="Keep advance"
      onConfirm={async () => {
        const result = await cancelAdvanceAction(id);
        if (!result.ok) throw new Error(result.error.message);
        toast.success("Advance cancelled.");
        router.refresh();
      }}
    />
  );
}
