"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";

interface ConfirmButtonProps extends Omit<ConfirmDialogProps, "trigger" | "open" | "onOpenChange"> {
  label: string;
  disabled?: boolean;
}

/** A destructive button that opens a `ConfirmDialog`; `onConfirm` runs only after confirmation. */
export function ConfirmButton({ label, disabled, tone = "destructive", ...dialog }: ConfirmButtonProps) {
  return (
    <ConfirmDialog
      {...dialog}
      tone={tone}
      trigger={
        <Button
          type="button"
          variant={tone === "destructive" ? "destructive" : "default"}
          disabled={disabled}
        >
          {label}
        </Button>
      }
    />
  );
}
