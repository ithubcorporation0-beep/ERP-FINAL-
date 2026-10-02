"use client";

import { Bell, CheckCheck, Circle, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { SelectInput } from "@/components/forms/select-input";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_TYPE_DEFINITIONS, NOTIFICATION_TYPES } from "@/config/notifications";
import { useUrlQuery } from "@/hooks/use-url-query";
import { cn } from "@/lib/utils";
import { openNotificationAction, setNotificationsReadAction } from "@/server/actions/notification.actions";

export interface NotificationRow {
  id: string;
  typeLabel: string;
  title: string;
  body: string | null;
  hasLink: boolean;
  read: boolean;
  at: string;
  atLabel: string;
}

const ALL = "all";

/** The notification center: filter, open, mark read / unread, mark all read. */
export function NotificationList({
  rows,
  total,
  page,
  pageSize,
  unread,
}: {
  rows: NotificationRow[];
  total: number;
  page: number;
  pageSize: number;
  unread: number;
}) {
  const router = useRouter();
  const query = useUrlQuery();
  const [pending, startTransition] = useTransition();
  const filtered = query.hasAny(["status", "type"]);

  function run(action: () => Promise<{ ok: boolean; error?: { message: string } }>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error?.message ?? "Something went wrong.");
      else if (success) toast.success(success);
      router.refresh();
    });
  }

  function open(id: string) {
    startTransition(async () => {
      const result = await openNotificationAction(id);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      router.push(result.data.href);
    });
  }

  return (
    <div className="space-y-4">
      <FilterBar
        onReset={filtered ? () => query.set({ status: null, type: null }) : undefined}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={unread === 0 || pending}
            onClick={() =>
              run(() => setNotificationsReadAction({ all: true }), "All notifications marked as read.")
            }
          >
            <CheckCheck aria-hidden="true" />
            Mark all as read
          </Button>
        }
      >
        <SelectInput
          aria-label="Show"
          className="sm:w-40"
          value={query.get("status") || ALL}
          onValueChange={(value) => query.set({ status: value === ALL ? null : value })}
          options={[
            { value: ALL, label: "All" },
            { value: "unread", label: `Unread (${unread})` },
          ]}
        />
        <SelectInput
          aria-label="Types"
          className="sm:w-56"
          value={query.get("type") || ALL}
          onValueChange={(value) => query.set({ type: value === ALL ? null : value })}
          options={[
            { value: ALL, label: "All types" },
            ...NOTIFICATION_TYPES.map((type) => ({
              value: type,
              label: NOTIFICATION_TYPE_DEFINITIONS[type].label,
            })),
          ]}
        />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filtered ? "Nothing matches" : "No notifications yet"}
          description={
            filtered
              ? "Try another filter."
              : "You'll be notified here about new invoices, payments, tasks, leave requests, low stock and more."
          }
        />
      ) : (
        <ul
          className="divide-y rounded-lg border"
          aria-label="Notifications"
          aria-busy={query.pending || pending}
        >
          {rows.map((row) => (
            <li key={row.id} className={cn("flex items-start gap-3 p-3", !row.read && "bg-primary/5")}>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  row.read ? "bg-transparent" : "bg-primary",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {row.typeLabel} · <time dateTime={row.at}>{row.atLabel}</time>
                </p>
                {row.hasLink ? (
                  <button
                    type="button"
                    className={cn("text-left text-sm hover:underline", !row.read && "font-semibold")}
                    onClick={() => open(row.id)}
                    disabled={pending}
                  >
                    {row.title}
                  </button>
                ) : (
                  <p className={cn("text-sm", !row.read && "font-semibold")}>{row.title}</p>
                )}
                {row.read ? null : <span className="sr-only"> (unread)</span>}
                {row.body ? <p className="text-sm text-muted-foreground">{row.body}</p> : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-label={row.read ? `Mark “${row.title}” as unread` : `Mark “${row.title}” as read`}
                onClick={() => run(() => setNotificationsReadAction({ ids: [row.id], read: !row.read }))}
              >
                {row.read ? <Circle aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
                <span className="hidden sm:inline">{row.read ? "Mark unread" : "Mark read"}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => query.set({ page: next })}
        onPageSizeChange={(size) => query.set({ pageSize: size })}
      />
    </div>
  );
}
