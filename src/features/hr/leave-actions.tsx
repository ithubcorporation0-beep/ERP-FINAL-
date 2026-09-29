"use client";

import { Check, Download, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormStatus } from "@/features/auth/form-status";
import type { ActionResult } from "@/lib/action";
import { apiErrorMessage } from "@/lib/api-client";
import { approveLeaveAction, cancelLeaveAction, rejectLeaveAction } from "@/server/actions/hr.actions";

interface LeaveActionsProps {
  id: string;
  code: string;
  hasAttachment: boolean;
  can: { approve: boolean; reject: boolean; cancel: boolean; attach: boolean };
}

/** Workflow buttons for one leave request; every rule is checked again on the server. */
export function LeaveActions({ id, code, hasAttachment, can }: LeaveActionsProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<"approve" | "reject" | "cancel" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

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
    const response = await fetch(`/api/leaves/${id}/attachment`, { method: "POST", body });
    if (fileInput.current) fileInput.current.value = "";
    if (!response.ok) return toast.error(await apiErrorMessage(response, "Upload"));
    toast.success("Attachment added.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {can.approve ? (
        <Button type="button" onClick={() => setDialog("approve")}>
          <Check aria-hidden="true" />
          Approve
        </Button>
      ) : null}
      {can.reject ? (
        <Button type="button" variant="outline" onClick={() => setDialog("reject")}>
          <X aria-hidden="true" />
          Reject
        </Button>
      ) : null}
      {hasAttachment ? (
        <Button asChild variant="outline">
          <a href={`/api/leaves/${id}/attachment`} download>
            <Download aria-hidden="true" />
            Attachment
          </a>
        </Button>
      ) : null}
      {can.attach ? (
        <>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
            className="sr-only"
            aria-label="Choose an attachment to upload"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload aria-hidden="true" />
            {hasAttachment ? "Replace attachment" : "Attach file"}
          </Button>
        </>
      ) : null}
      {can.cancel ? (
        <Button type="button" variant="destructive" onClick={() => setDialog("cancel")}>
          Cancel request
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(value) => (value ? undefined : close())}
        title={`Cancel ${code}?`}
        description="The request is withdrawn and removed from lists. Its history stays in the audit log."
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        onConfirm={async () => {
          const result = await cancelLeaveAction(id);
          if (!result.ok) throw new Error(result.error.message);
          toast.success("Leave request cancelled.");
          router.push("/hr/leave");
          router.refresh();
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
                ? "The days count as leave in attendance, not as absences."
                : "The employee sees your reason and can request other dates."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="leave-decision-note">{dialog === "approve" ? "Note (optional)" : "Reason"}</Label>
            <Textarea
              id="leave-decision-note"
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
                onClick={() => void run(() => approveLeaveAction({ id, note }), "Leave approved.")}
              >
                Approve
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void run(() => rejectLeaveAction({ id, note }), "Leave rejected.")}
              >
                Reject
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
