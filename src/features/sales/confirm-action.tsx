"use client";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";

export interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "default" | "destructive";
  run: () => Promise<ActionResult<unknown>>;
  /** After success (e.g. toast + navigate). */
  done: () => void;
}

/** Runs a server action after confirmation; failures stay in the dialog (ConfirmDialog shows the message). */
export function ActionConfirmDialog({
  action,
  onClose,
}: {
  action: PendingAction | null;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={action !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={action?.title ?? ""}
      description={action?.description ?? ""}
      confirmLabel={action?.confirmLabel}
      tone={action?.tone}
      onConfirm={async () => {
        if (!action) return;
        const result = await action.run();
        if (!result.ok) throw new Error(result.error.message);
        onClose();
        action.done();
      }}
    />
  );
}

/** A button that asks for confirmation before running `action`. */
export function ActionButton({
  label,
  icon,
  variant = "outline",
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  variant?: "default" | "outline" | "destructive";
  onClick: () => void;
}) {
  return (
    <Button type="button" variant={variant} onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}
