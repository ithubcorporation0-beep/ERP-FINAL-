"use client";

import { Check, HandCoins, RefreshCw, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SelectInput } from "@/components/forms/select-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/config/sales";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import type { ActionResult } from "@/lib/action";
import {
  approvePayrollAction,
  cancelPayrollAction,
  payPayrollAction,
  recalculatePayrollAction,
  rejectPayrollAction,
  submitPayrollAction,
} from "@/server/actions/payroll.actions";

type DialogKind = "recalculate" | "submit" | "approve" | "reject" | "pay" | "cancel" | null;

interface PayrollRunActionsProps {
  id: string;
  code: string;
  label: string;
  today: string;
  net: string;
  /** "Approve" is hidden for the person who processed the run (the server refuses it too). */
  processedByYou: boolean;
  can: { edit: boolean; submit: boolean; approve: boolean; reject: boolean; pay: boolean; cancel: boolean };
}

/** Workflow of one payroll run. Every step asks for confirmation; the server re-checks everything. */
export function PayrollRunActions({
  id,
  code,
  label,
  today,
  net,
  processedByYou,
  can,
}: PayrollRunActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setDialog(null);
    setError(undefined);
    setNote("");
  }

  async function run(action: () => Promise<ActionResult<unknown>>, success: string) {
    setBusy(true);
    setError(undefined);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
      return;
    }
    toast.success(success);
    setDialog(null);
    setNote("");
    router.refresh();
  }

  /** Confirm dialogs throw so the dialog stays open and shows the error. */
  async function confirmed(action: () => Promise<ActionResult<unknown>>, success: string) {
    const result = await action();
    if (!result.ok) throw new Error(result.error.message);
    toast.success(success);
    router.refresh();
  }

  const reasonDialog = dialog === "approve" || dialog === "reject" || dialog === "cancel";

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit ? (
        <Button type="button" variant="outline" onClick={() => setDialog("recalculate")}>
          <RefreshCw aria-hidden="true" />
          Recalculate
        </Button>
      ) : null}
      {can.submit ? (
        <Button type="button" onClick={() => setDialog("submit")}>
          <Send aria-hidden="true" />
          Submit for approval
        </Button>
      ) : null}
      {can.approve ? (
        <Button type="button" onClick={() => setDialog("approve")}>
          <Check aria-hidden="true" />
          Approve
        </Button>
      ) : null}
      {can.reject ? (
        <Button type="button" variant="outline" onClick={() => setDialog("reject")}>
          <X aria-hidden="true" />
          Send back
        </Button>
      ) : null}
      {can.pay ? (
        <Button type="button" onClick={() => setDialog("pay")}>
          <HandCoins aria-hidden="true" />
          Mark as paid
        </Button>
      ) : null}
      {can.cancel ? (
        <Button type="button" variant="destructive" onClick={() => setDialog("cancel")}>
          Cancel payroll
        </Button>
      ) : null}
      {processedByYou && !can.approve && !can.edit ? (
        <p className="w-full text-sm text-muted-foreground">
          You processed this payroll, so another approver has to approve it.
        </p>
      ) : null}

      <ConfirmDialog
        open={dialog === "recalculate"}
        onOpenChange={(value) => (value ? undefined : close())}
        tone="default"
        title={`Recalculate ${code}?`}
        description="Payslips are rebuilt from the current salary structures, employees and advances. Bonus, overtime and notes you typed are kept; other manual changes are replaced."
        confirmLabel="Recalculate"
        onConfirm={() => confirmed(() => recalculatePayrollAction(id), "Payroll recalculated.")}
      />
      <ConfirmDialog
        open={dialog === "submit"}
        onOpenChange={(value) => (value ? undefined : close())}
        tone="default"
        title={`Submit ${code} for approval?`}
        description={`Payslips for ${label} can't be changed while waiting for approval. Net total: ${net}.`}
        confirmLabel="Submit"
        onConfirm={() => confirmed(() => submitPayrollAction(id), "Submitted for approval.")}
      />

      <Dialog open={reasonDialog} onOpenChange={(value) => (value ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "approve"
                ? `Approve ${code}?`
                : dialog === "reject"
                  ? `Send ${code} back to draft?`
                  : `Cancel ${code}?`}
            </DialogTitle>
            <DialogDescription>
              {dialog === "approve"
                ? `Payslips are frozen and can be paid. Net total: ${net}.`
                : dialog === "reject"
                  ? "The payroll can be corrected and submitted again."
                  : `The payroll is kept for the record but no longer counts; ${label} can be processed again.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payroll-note">{dialog === "approve" ? "Note (optional)" : "Reason"}</Label>
            <Textarea
              id="payroll-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <FormStatus tone="error" message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Back
            </Button>
            {dialog === "approve" ? (
              <Button
                disabled={busy}
                onClick={() => void run(() => approvePayrollAction({ id, note }), "Payroll approved.")}
              >
                Approve
              </Button>
            ) : dialog === "reject" ? (
              <Button
                disabled={busy}
                onClick={() => void run(() => rejectPayrollAction({ id, note }), "Sent back to draft.")}
              >
                Send back
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void run(() => cancelPayrollAction({ id, note }), "Payroll cancelled.")}
              >
                Cancel payroll
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "pay"} onOpenChange={(value) => (value ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {code} as paid</DialogTitle>
            <DialogDescription>
              Posts the payroll to the accounts (salaries expense, tax and deductions withheld, advances
              recovered, net {net} paid). This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payroll-paid-at">Payment date</Label>
              <Input
                id="payroll-paid-at"
                type="date"
                value={paidAt}
                max={today}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payroll-method">Paid with</Label>
              <SelectInput
                id="payroll-method"
                className="sm:w-full"
                value={method}
                onValueChange={setMethod}
                options={optionsOf(PAYMENT_METHODS, PAYMENT_METHOD_LABELS)}
              />
            </div>
          </div>
          <FormStatus tone="error" message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Back
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(() => payPayrollAction({ id, paidAt, method }), "Payroll paid and posted.")
              }
            >
              Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
