"use client";

import { Camera, Pencil, RefreshCw, Trash2 } from "lucide-react";
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
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  EXIT_STATUSES,
  type EmploymentStatusKey,
} from "@/config/hr";
import { FormStatus } from "@/features/auth/form-status";
import { optionsOf } from "@/features/crm/labels";
import { apiErrorMessage } from "@/lib/api-client";
import { changeEmployeeStatusAction, deleteEmployeeAction } from "@/server/actions/hr.actions";

interface EmployeeToolbarProps {
  id: string;
  name: string;
  status: EmploymentStatusKey;
  exitDate: string | null;
  hasPhoto: boolean;
  today: string;
  can: { edit: boolean; delete: boolean };
}

/** Actions on one employee. Every rule is checked again on the server. */
export function EmployeeToolbar({ id, name, status, exitDate, hasPhoto, today, can }: EmployeeToolbarProps) {
  const router = useRouter();
  const photoInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<"status" | "delete" | null>(null);
  const [nextStatus, setNextStatus] = useState<EmploymentStatusKey>(status);
  const [nextExit, setNextExit] = useState(exitDate ?? today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const leaving = EXIT_STATUSES.includes(nextStatus);

  async function uploadPhoto(file: File) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(`/api/employees/${id}/photo`, { method: "POST", body });
    if (photoInput.current) photoInput.current.value = "";
    if (!response.ok) return toast.error(await apiErrorMessage(response, "Upload"));
    toast.success("Photo updated.");
    router.refresh();
  }

  async function removePhoto() {
    const response = await fetch(`/api/employees/${id}/photo`, { method: "DELETE" });
    if (!response.ok) return toast.error(await apiErrorMessage(response, "Remove"));
    toast.success("Photo removed.");
    router.refresh();
  }

  async function saveStatus() {
    setBusy(true);
    setError(undefined);
    const result = await changeEmployeeStatusAction(id, {
      status: nextStatus,
      exitDate: leaving ? nextExit : "",
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.message);
      return;
    }
    toast.success(`Status changed to ${EMPLOYMENT_STATUS_LABELS[nextStatus].toLowerCase()}.`);
    setDialog(null);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {can.edit ? (
        <>
          <Button asChild variant="outline">
            <Link href={`/hr/employees/${id}/edit`}>
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => setDialog("status")}>
            <RefreshCw aria-hidden="true" />
            Change status
          </Button>
          <input
            ref={photoInput}
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            className="sr-only"
            aria-label="Choose a photo to upload"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadPhoto(file);
            }}
          />
          <Button type="button" variant="outline" onClick={() => photoInput.current?.click()}>
            <Camera aria-hidden="true" />
            {hasPhoto ? "Replace photo" : "Add photo"}
          </Button>
          {hasPhoto ? (
            <Button type="button" variant="ghost" onClick={() => void removePhoto()}>
              Remove photo
            </Button>
          ) : null}
        </>
      ) : null}
      {can.delete ? (
        <Button type="button" variant="destructive" onClick={() => setDialog("delete")}>
          <Trash2 aria-hidden="true" />
          Delete
        </Button>
      ) : null}

      <Dialog
        open={dialog === "status"}
        onOpenChange={(open) => (open || busy ? undefined : setDialog(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change employment status</DialogTitle>
            <DialogDescription>
              Resigned and terminated employees need their last working day. The change is recorded in the
              history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="employee-status">New status</Label>
              <SelectInput
                id="employee-status"
                className="sm:w-full"
                value={nextStatus}
                onValueChange={(value) => {
                  const match = EMPLOYMENT_STATUSES.find((item) => item === value);
                  if (match) setNextStatus(match);
                }}
                options={optionsOf(EMPLOYMENT_STATUSES, EMPLOYMENT_STATUS_LABELS)}
              />
            </div>
            {leaving ? (
              <div className="space-y-2">
                <Label htmlFor="employee-exit">Last working day</Label>
                <Input
                  id="employee-exit"
                  type="date"
                  value={nextExit}
                  onChange={(event) => setNextExit(event.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="employee-status-note">Note (optional)</Label>
              <Textarea
                id="employee-status-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            <FormStatus tone="error" message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveStatus()} disabled={busy}>
              Save status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => (open ? undefined : setDialog(null))}
        title={`Delete ${name}?`}
        description="The employee is removed from lists and their login is unlinked. Attendance and leave history stay in the records and the audit log. To keep the profile, change the status instead."
        confirmLabel="Delete employee"
        onConfirm={async () => {
          const result = await deleteEmployeeAction(id);
          if (!result.ok) throw new Error(result.error.message);
          toast.success("Employee deleted.");
          router.push("/hr/employees");
          router.refresh();
        }}
      />
    </div>
  );
}
