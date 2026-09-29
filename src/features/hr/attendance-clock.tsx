"use client";

import { Loader2, LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DAY_STATUS_LABELS, type DayStatusKey } from "@/config/hr";
import { FormStatus } from "@/features/auth/form-status";
import { checkInAction, checkOutAction } from "@/server/actions/hr.actions";
import { DAY_STATUS_TONES } from "./labels";

interface AttendanceClockProps {
  /** Preformatted times in the company time zone. */
  checkIn: string | null;
  checkOut: string | null;
  status: DayStatusKey | null;
  detail: string | null;
  schedule: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
}

/** The signed-in employee's check-in / check-out. The server records its own clock time, not the browser's. */
export function AttendanceClock({
  checkIn,
  checkOut,
  status,
  detail,
  schedule,
  canCheckIn,
  canCheckOut,
}: AttendanceClockProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run(kind: "in" | "out") {
    setBusy(true);
    setError(undefined);
    const result = kind === "in" ? await checkInAction() : await checkOutAction();
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    toast.success(kind === "in" ? "Checked in." : "Checked out.");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {status ? (
          <StatusBadge tone={DAY_STATUS_TONES[status]}>{DAY_STATUS_LABELS[status]}</StatusBadge>
        ) : null}
        <span className="text-sm">
          Check-in: <strong>{checkIn ?? "—"}</strong> · Check-out: <strong>{checkOut ?? "—"}</strong>
        </span>
      </div>
      {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      <p className="text-xs text-muted-foreground">Work schedule: {schedule}</p>
      <div className="flex flex-wrap gap-2">
        {canCheckIn ? (
          <Button type="button" onClick={() => void run("in")} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}
            Check in
          </Button>
        ) : null}
        {canCheckOut ? (
          <Button type="button" variant="outline" onClick={() => void run("out")} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
            Check out
          </Button>
        ) : null}
      </div>
      <FormStatus tone="error" message={error} />
    </div>
  );
}
