"use client";

import { Check, Download, HandCoins, Pencil, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
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
import { EXPENSE_PAYMENT_METHOD_LABELS, PAID_METHODS, type ExpenseStatusKey } from "@/config/accounting";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import type { ActionResult } from "@/lib/action";
import { apiErrorMessage } from "@/lib/api-client";
import {
  approveExpenseAction,
  deleteExpenseAction,
  payExpenseAction,
  rejectExpenseAction,
} from "@/server/actions/expense.actions";

interface ExpenseActionsProps {
  id: string;
  code: string;
  status: ExpenseStatusKey;
  unpaid: boolean;
  hasReceipt: boolean;
  today: string;
  can: { change: boolean; delete: boolean; approve: boolean; reject: boolean; pay: boolean };
}

type DialogKind = "approve" | "reject" | "pay" | "delete" | null;

/** Workflow buttons for one expense; every server check is repeated in the service. */
export function ExpenseActions({ id, code, status, unpaid, hasReceipt, today, can }: ExpenseActionsProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<string>("BANK_TRANSFER");
  const [paidAt, setPaidAt] = useState(today);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const open = status === "PENDING" || status === "REJECTED";

  function close() {
    if (busy) return;
    setDialog(null);
    setError(undefined);
    setNote("");
  }

  async function run(action: () => Promise<ActionResult>, success: string) {
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

  async function upload(file: File) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`/api/expenses/${id}/receipt`, { method: "POST", body });
    if (fileInput.current) fileInput.current.value = "";
    if (!response.ok) return toast.error(await apiErrorMessage(response, "Upload"));
    toast.success("Receipt attached.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {can.approve && status === "PENDING" ? (
        <Button type="button" onClick={() => setDialog("approve")}>
          <Check aria-hidden="true" />
          Approve
        </Button>
      ) : null}
      {can.reject && status === "PENDING" ? (
        <Button type="button" variant="outline" onClick={() => setDialog("reject")}>
          <X aria-hidden="true" />
          Reject
        </Button>
      ) : null}
      {can.pay && status === "APPROVED" && unpaid ? (
        <Button type="button" onClick={() => setDialog("pay")}>
          <HandCoins aria-hidden="true" />
          Mark as paid
        </Button>
      ) : null}
      {can.change && open ? (
        <Button asChild variant="outline">
          <Link href={`/finance/expenses/${id}/edit`}>
            <Pencil aria-hidden="true" />
            {status === "REJECTED" ? "Correct and resubmit" : "Edit"}
          </Link>
        </Button>
      ) : null}
      {hasReceipt ? (
        <Button asChild variant="outline">
          <a href={`/api/expenses/${id}/receipt`} download>
            <Download aria-hidden="true" />
            Receipt
          </a>
        </Button>
      ) : null}
      {can.change ? (
        <>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="sr-only"
            aria-label="Choose a receipt to upload"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden="true" />
            {hasReceipt ? "Replace receipt" : "Attach receipt"}
          </Button>
        </>
      ) : null}
      {can.delete && open ? (
        <Button type="button" variant="destructive" onClick={() => setDialog("delete")}>
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(value) => (value ? undefined : close())}
        title={`Delete ${code}?`}
        description="The expense is removed from lists. Its history stays in the audit log."
        confirmLabel="Delete expense"
        onConfirm={async () => {
          const result = await deleteExpenseAction(id);
          if (!result.ok) throw new Error(result.error.message);
          toast.success("Expense deleted.");
          router.push("/finance/expenses");
        }}
      />

      <Dialog
        open={dialog === "approve" || dialog === "reject"}
        onOpenChange={(value) => (value ? undefined : close())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "approve" ? `Approve ${code}?` : `Reject ${code}?`}</DialogTitle>
            <DialogDescription>
              {dialog === "approve"
                ? "The expense is posted to the ledger and can no longer be changed."
                : "The submitter can correct it and submit it again."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decision-note">{dialog === "approve" ? "Note (optional)" : "Reason"}</Label>
            <Textarea
              id="decision-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <FormStatus tone="error" message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            {dialog === "approve" ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() => approveExpenseAction({ id, note }), "Expense approved and posted.")
                }
              >
                Approve
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void run(() => rejectExpenseAction({ id, note }), "Expense rejected.")}
              >
                Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "pay"} onOpenChange={(value) => (value ? undefined : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {code} as paid</DialogTitle>
            <DialogDescription>Moves the amount from Accounts Payable to Cash or Bank.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pay-method">Paid with</Label>
              <SelectInput
                id="pay-method"
                className="sm:w-full"
                value={method}
                onValueChange={setMethod}
                options={optionsOf(PAID_METHODS, EXPENSE_PAYMENT_METHOD_LABELS)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-date">Payment date</Label>
              <Input
                id="pay-date"
                type="date"
                value={paidAt}
                max={today}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </div>
          </div>
          <FormStatus tone="error" message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(() => payExpenseAction({ id, method, paidAt }), "Expense marked as paid.")
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
