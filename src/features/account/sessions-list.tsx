"use client";

import { Monitor, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmButton } from "@/components/shared/confirm-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/server/actions/account.actions";

export interface SessionRow {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

/** "Chrome on Windows" from a user-agent string — good enough to recognise a device. */
export function describeDevice(userAgent: string | null): { label: string; mobile: boolean } {
  if (!userAgent) return { label: "Unknown device", mobile: false };
  const browser =
    ["Edg", "Firefox", "Chrome", "Safari"]
      .find((name) => userAgent.includes(`${name}/`))
      ?.replace("Edg", "Edge") ?? "Browser";
  const os =
    [
      ["Windows", "Windows"],
      ["Android", "Android"],
      ["iPhone", "iOS"],
      ["iPad", "iPadOS"],
      ["Mac OS X", "macOS"],
      ["Linux", "Linux"],
    ].find(([needle]) => needle && userAgent.includes(needle))?.[1] ?? "unknown system";
  return { label: `${browser} on ${os}`, mobile: /Mobile|Android|iPhone/.test(userAgent) };
}

export function SessionsList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const others = sessions.filter((session) => !session.current).length;
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  async function revoke(id: string) {
    const result = await revokeSessionAction(id);
    if (!result.ok) throw new Error(result.error.message);
    toast.success("Session signed out.");
    router.refresh();
  }

  async function revokeOthers() {
    const result = await revokeOtherSessionsAction();
    if (!result.ok) throw new Error(result.error.message);
    toast.success(`Signed out ${result.data} other session(s).`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {sessions.map((session) => {
          const device = describeDevice(session.userAgent);
          const Icon = device.mobile ? Smartphone : Monitor;
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {device.label}{" "}
                  {session.current ? (
                    <StatusBadge tone="success" className="ml-1">
                      This device
                    </StatusBadge>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.ipAddress ?? "Unknown IP"} · last active{" "}
                  {format.format(new Date(session.lastUsedAt))}
                </p>
              </div>
              {session.current ? null : (
                <ConfirmDialog
                  title="Sign out this session?"
                  description={`${device.label} will need to sign in again.`}
                  confirmLabel="Sign out"
                  onConfirm={() => revoke(session.id)}
                  trigger={
                    <Button variant="outline" size="sm">
                      Sign out
                    </Button>
                  }
                />
              )}
            </li>
          );
        })}
      </ul>
      {others > 0 ? (
        <ConfirmButton
          label="Sign out all other sessions"
          title="Sign out everywhere else?"
          description={`${others} other session(s) will be signed out. This device stays signed in.`}
          confirmLabel="Sign out others"
          onConfirm={revokeOthers}
        />
      ) : null}
    </div>
  );
}
