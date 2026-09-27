"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/shared/confirm-button";
import type { ActionResult } from "@/lib/action";

interface DeleteRecordButtonProps {
  /** e.g. "customer", "lead". */
  noun: string;
  name: string;
  action: () => Promise<ActionResult>;
  /** Where to go after deleting. */
  redirectTo: string;
}

/** Delete with confirmation, then return to the list. Used on customer and lead pages. */
export function DeleteRecordButton({ noun, name, action, redirectTo }: DeleteRecordButtonProps) {
  const router = useRouter();
  return (
    <ConfirmButton
      label="Delete"
      title={`Delete this ${noun}?`}
      description={`“${name}” will be removed from lists and search. Its history stays in the audit log.`}
      confirmLabel={`Delete ${noun}`}
      onConfirm={async () => {
        const result = await action();
        if (!result.ok) throw new Error(result.error.message);
        toast.success(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} deleted.`);
        router.push(redirectTo);
        router.refresh();
      }}
    />
  );
}
