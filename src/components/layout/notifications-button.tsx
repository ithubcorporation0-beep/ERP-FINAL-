"use client";

import { Bell, CheckCheck, Loader2, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { openNotificationAction, setNotificationsReadAction } from "@/server/actions/notification.actions";

interface RecentNotification {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "5 minutes ago", "yesterday" — rough, for the dropdown only. */
function ago(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return RELATIVE.format(0, "minute");
}

/**
 * Header bell: the real unread count, and a dropdown with the latest notifications (loaded when opened). Opening one
 * marks it read and follows its link; "Mark all as read" clears the count.
 */
export function NotificationsButton({ unread: initialUnread }: { unread: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentNotification[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const label = unread === 0 ? "Notifications" : `Notifications, ${unread} unread`;

  async function load() {
    setError(undefined);
    const response = await fetch("/api/notifications/recent", { cache: "no-store" });
    if (!response.ok) {
      setError(await apiErrorMessage(response, "Loading notifications"));
      return;
    }
    const data: { items: RecentNotification[]; unread: number } = await response.json();
    setItems(data.items);
    setUnread(data.unread);
  }

  function openItem(id: string) {
    startTransition(async () => {
      const result = await openNotificationAction(id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setOpen(false);
      router.push(result.data.href);
      router.refresh();
    });
  }

  function markAllRead() {
    startTransition(async () => {
      const result = await setNotificationsReadAction({ all: true });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setUnread(0);
      setItems(
        (current) =>
          current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? null,
      );
      router.refresh();
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={label}>
          <Bell />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] leading-4 font-semibold text-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" aria-label="Recent notifications">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unread === 0 || pending}
            onClick={markAllRead}
          >
            <CheckCheck aria-hidden="true" />
            Mark all as read
          </Button>
        </div>
        {error ? (
          <p role="alert" className="p-3 text-sm text-danger">
            {error}
          </p>
        ) : items === null ? (
          <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto" aria-label="Latest notifications">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => openItem(item.id)}
                  className={cn(
                    "flex w-full gap-2 px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                    item.readAt && "text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      item.readAt ? "bg-transparent" : "bg-primary",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !item.readAt && "font-medium text-foreground")}>
                      {item.title}
                      {item.readAt ? null : <span className="sr-only"> (unread)</span>}
                    </span>
                    {item.body ? <span className="line-clamp-2 block text-xs">{item.body}</span> : null}
                    <span className="block text-xs text-muted-foreground">{ago(item.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-sm">
          <Link href="/notifications" className="text-primary hover:underline" onClick={() => setOpen(false)}>
            See all notifications
          </Link>
          <Link
            href="/notifications/preferences"
            className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
            onClick={() => setOpen(false)}
          >
            <Settings className="size-3.5" aria-hidden="true" />
            Settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
