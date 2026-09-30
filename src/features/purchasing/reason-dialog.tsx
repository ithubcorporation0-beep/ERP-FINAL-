"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action";

interface ReasonDialogProps {
  /** Text of the button that opens the dialog. */
  trigger: string;
  triggerVariant?: "outline" | "ghost" | "destructive";
  title: string;
  description: string;
  confirmLabel: string;
  /** Label of the text box, e.g. "Reason". */
  label?: string;
  /** When false, the text is optional (e.g. an approval note). */
  required?: boolean;
  success: string;
  run: (reason: string) => Promise<ActionResult<unknown>>;
}

/**
 * Confirmation that asks for a reason (reject, cancel, void) — the destructive step and the explanation in one
 * dialog. Server errors stay in the dialog.
 */
export function ReasonDialog({
  trigger,
  triggerVariant = "outline",
  title,
  description,
  confirmLabel,
  label = "Reason",
  required = true,
  success,
  run,
}: ReasonDialogProps) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (required && reason.trim().length < 3) return setError("Give a reason (at least 3 characters).");
    setBusy(true);
    setError(undefined);
    const result = await run(reason.trim());
    setBusy(false);
    if (!result.ok) {
      return setError(
        result.error.fieldErrors?.reason?.[0] ?? result.error.fieldErrors?.note?.[0] ?? result.error.message,
      );
    }
    toast.success(success);
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : setOpen(next))}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={id}>
            {label}
            {required ? "" : " (optional)"}
          </Label>
          <Textarea
            id={id}
            rows={3}
            value={reason}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
