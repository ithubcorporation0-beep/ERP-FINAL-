"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NotificationTypeKey } from "@/config/notifications";
import { FormStatus } from "@/features/auth/form-status";
import { saveNotificationPreferencesAction } from "@/server/actions/notification.actions";

export interface PreferenceRow {
  type: NotificationTypeKey;
  label: string;
  audience: string;
  inApp: boolean;
  email: boolean;
}

/** Per type: in-app and/or email. WhatsApp and SMS are listed as coming later, not offered. */
export function PreferencesForm({ initial }: { initial: PreferenceRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function toggle(type: NotificationTypeKey, channel: "inApp" | "email", value: boolean) {
    setRows((current) => current.map((row) => (row.type === type ? { ...row, [channel]: value } : row)));
  }

  function save() {
    setError(undefined);
    startTransition(async () => {
      const result = await saveNotificationPreferencesAction({
        preferences: rows.map(({ type, inApp, email }) => ({ type, inApp, email })),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success("Notification settings saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableCaption className="sr-only">Notification channels per type</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Notification</TableHead>
              <TableHead className="text-center">In the app</TableHead>
              <TableHead className="text-center">Email</TableHead>
              <TableHead className="text-center text-muted-foreground">WhatsApp / SMS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.type}>
                <TableCell>
                  <p className="font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">{row.audience}</p>
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    aria-label={`${row.label} in the app`}
                    checked={row.inApp}
                    onCheckedChange={(value) => toggle(row.type, "inApp", value === true)}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    aria-label={`${row.label} by email`}
                    checked={row.email}
                    onCheckedChange={(value) => toggle(row.type, "email", value === true)}
                  />
                </TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">Coming later</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <FormStatus tone="error" message={error} />
      <Button type="button" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Save settings
      </Button>
    </div>
  );
}
