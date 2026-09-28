"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { reverseTransactionAction } from "@/server/actions/accounting.actions";

/** Posts the mirror image of a manual transaction (after confirmation) and opens it. */
export function ReverseTransactionButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Reverse"
      title={`Reverse ${code}?`}
      description="A new transaction with debits and credits swapped is posted today. The original stays in the ledger."
      confirmLabel="Post reversal"
      onConfirm={async () => {
        const result = await reverseTransactionAction(id);
        if (!result.ok) throw new Error(result.error.message);
        toast.success("Reversal posted.");
        if (result.data) router.push(`/finance/transactions/${result.data.id}`);
        router.refresh();
      }}
    />
  );
}
