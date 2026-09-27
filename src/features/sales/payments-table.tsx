"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormStatus } from "@/features/auth/form-status";
import { voidPaymentAction } from "@/server/actions/payment.actions";

export interface PaymentEntry {
  id: string;
  code: string;
  date: string;
  method: string;
  reference: string | null;
  amount: string;
  recordedBy: string | null;
  voided: { reason: string; by: string | null } | null;
}

/** Payments of one invoice or customer, with "Void" (reason required, confirmed in a dialog). */
export function PaymentsTable({
  payments,
  canVoid,
  caption,
}: {
  payments: PaymentEntry[];
  canVoid: boolean;
  caption: string;
}) {
  const router = useRouter();
  const [voiding, setVoiding] = useState<PaymentEntry | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function confirmVoid() {
    if (!voiding) return;
    setBusy(true);
    setError(undefined);
    const result = await voidPaymentAction({ id: voiding.id, reason });
    setBusy(false);
    if (!result.ok) return setError(result.error.fieldErrors?.reason?.[0] ?? result.error.message);
    toast.success(`${voiding.code} voided.`);
    setVoiding(null);
    setReason("");
    router.refresh();
  }

  if (payments.length === 0) return <EmptyState size="compact" icon={Ban} title="No payments yet" />;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Payment ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>
                <span className="sr-only">Status</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id} className={payment.voided ? "text-muted-foreground" : undefined}>
                <TableCell className="font-mono text-xs">{payment.code}</TableCell>
                <TableCell>{payment.date}</TableCell>
                <TableCell>{payment.method}</TableCell>
                <TableCell>{payment.reference ?? "—"}</TableCell>
                <TableCell className={payment.voided ? "text-right line-through" : "text-right"} data-numeric>
                  {payment.amount}
                </TableCell>
                <TableCell className="text-right">
                  {payment.voided ? (
                    <StatusBadge tone="neutral">
                      Voided{payment.voided.reason ? `: ${payment.voided.reason}` : ""}
                    </StatusBadge>
                  ) : canVoid ? (
                    <Button variant="ghost" size="sm" onClick={() => setVoiding(payment)}>
                      Void
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={voiding !== null} onOpenChange={(open) => (open || busy ? undefined : setVoiding(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void {voiding?.code}?</DialogTitle>
            <DialogDescription>
              The payment stays on record, marked as voided, and its amount goes back onto the invoice
              balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea
              id="void-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <FormStatus tone="error" message={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoiding(null)} disabled={busy}>
              Keep payment
            </Button>
            <Button variant="destructive" onClick={() => void confirmVoid()} disabled={busy}>
              Void payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
