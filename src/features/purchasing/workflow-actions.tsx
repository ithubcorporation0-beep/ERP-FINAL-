"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  cancelSupplierInvoiceAction,
  decidePurchaseRequestAction,
  setPurchaseOrderStatusAction,
  voidSupplierPaymentAction,
} from "@/server/actions/purchasing.actions";
import { ReasonDialog } from "./reason-dialog";

/** Approve / reject / cancel buttons of a purchase request (only those the user may use). */
export function PurchaseRequestActions({
  id,
  code,
  can,
}: {
  id: string;
  code: string;
  can: { approve: boolean; reject: boolean; cancel: boolean };
}) {
  return (
    <>
      {can.approve ? (
        <ReasonDialog
          trigger="Approve"
          title={`Approve ${code}?`}
          description="The request can then be turned into a purchase order."
          confirmLabel="Approve request"
          label="Note"
          required={false}
          success="Purchase request approved."
          run={(note) => decidePurchaseRequestAction(id, { decision: "approve", note })}
        />
      ) : null}
      {can.reject ? (
        <ReasonDialog
          trigger="Reject"
          title={`Reject ${code}?`}
          description="The requester sees your reason. A rejected request can't be ordered."
          confirmLabel="Reject request"
          success="Purchase request rejected."
          run={(note) => decidePurchaseRequestAction(id, { decision: "reject", note })}
        />
      ) : null}
      {can.cancel ? (
        <ReasonDialog
          trigger="Cancel request"
          triggerVariant="ghost"
          title={`Cancel ${code}?`}
          description="A cancelled request can't be approved or ordered any more."
          confirmLabel="Cancel request"
          label="Note"
          required={false}
          success="Purchase request cancelled."
          run={(note) => decidePurchaseRequestAction(id, { decision: "cancel", note })}
        />
      ) : null}
    </>
  );
}

/** "Place order" (Draft → Ordered) with confirmation. */
export function PlaceOrderButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      tone="default"
      title={`Place ${code} with the supplier?`}
      description="The order can then no longer be edited; goods can be received against it."
      confirmLabel="Place order"
      trigger={
        <Button type="button">
          <Send aria-hidden="true" />
          Place order
        </Button>
      }
      onConfirm={async () => {
        const result = await setPurchaseOrderStatusAction(id, { action: "order" });
        if (!result.ok) throw new Error(result.error.message);
        toast.success("Order placed.");
        router.refresh();
      }}
    />
  );
}

export function CancelOrderButton({ id, code }: { id: string; code: string }) {
  return (
    <ReasonDialog
      trigger="Cancel order"
      triggerVariant="ghost"
      title={`Cancel ${code}?`}
      description="Only orders nothing was received or billed for can be cancelled. Its purchase request is cancelled too."
      confirmLabel="Cancel order"
      success="Purchase order cancelled."
      run={(reason) => setPurchaseOrderStatusAction(id, { action: "cancel", reason })}
    />
  );
}

export function CancelBillButton({ id, code }: { id: string; code: string }) {
  return (
    <ReasonDialog
      trigger="Cancel bill"
      triggerVariant="ghost"
      title={`Cancel ${code}?`}
      description="Only unpaid bills can be cancelled. The Accounts Payable posting is reversed."
      confirmLabel="Cancel bill"
      success="Supplier invoice cancelled."
      run={(reason) => cancelSupplierInvoiceAction(id, { reason })}
    />
  );
}

export function VoidSupplierPaymentButton({ id, code }: { id: string; code: string }) {
  return (
    <ReasonDialog
      trigger="Void"
      triggerVariant="ghost"
      title={`Void payment ${code}?`}
      description="The payment stays in the history marked as voided; its ledger posting is reversed and the bill's balance reopens."
      confirmLabel="Void payment"
      success="Payment voided."
      run={(reason) => voidSupplierPaymentAction(id, { reason })}
    />
  );
}
