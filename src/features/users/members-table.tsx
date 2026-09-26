"use client";

import { MoreHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { SelectOption } from "@/components/forms/select-input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchInput } from "@/components/shared/search-input";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { DataTable } from "@/components/tables/data-table";
import { createDataTableColumns } from "@/components/tables/data-table-features";
import { Pagination } from "@/components/tables/pagination";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  removeMemberAction,
  resendInvitationAction,
  setMemberSuspendedAction,
} from "@/server/actions/member.actions";
import { ChangeRoleDialog } from "./change-role-dialog";

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  lastLoginAt: string | null;
  isSelf: boolean;
}

const STATUS: Record<MemberRow["status"], { tone: StatusTone; label: string }> = {
  ACTIVE: { tone: "success", label: "Active" },
  INVITED: { tone: "info", label: "Invited" },
  SUSPENDED: { tone: "danger", label: "Suspended" },
};

type Pending = { kind: "role" | "suspend" | "reactivate" | "remove"; member: MemberRow } | null;

const col = createDataTableColumns<MemberRow>();

export function MembersTable({
  members,
  total,
  page,
  pageSize,
  canManage,
  assignableRoles,
}: {
  members: MemberRow[];
  total: number;
  page: number;
  pageSize: number;
  canManage: boolean;
  assignableRoles: SelectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState<Pending>(null);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }), []);

  function setQuery(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function resend(member: MemberRow) {
    const result = await resendInvitationAction(member.id);
    if (!result.ok) return toast.error(result.error.message);
    if (result.data.emailSent) toast.success(`Invitation resent to ${member.email}.`);
    else toast.warning("The email could not be sent. Please try again later.");
  }

  async function run(action: Promise<{ ok: boolean; error?: { message: string } }>, success: string) {
    const result = await action;
    if (!result.ok) throw new Error(result.error?.message ?? "The action failed.");
    toast.success(success);
    router.refresh();
  }

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("name", {
          header: "Name",
          enableSorting: false,
          cell: ({ row }) => (
            <div className="min-w-0">
              <p className="font-medium">
                {row.original.name}
                {row.original.isSelf ? (
                  <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            </div>
          ),
        }),
        col.accessor("roleName", { header: "Role", enableSorting: false }),
        col.accessor("status", {
          header: "Status",
          enableSorting: false,
          cell: ({ row }) => (
            <StatusBadge tone={STATUS[row.original.status].tone}>
              {STATUS[row.original.status].label}
            </StatusBadge>
          ),
        }),
        col.accessor("lastLoginAt", {
          header: "Last sign-in",
          enableSorting: false,
          cell: ({ row }) =>
            row.original.lastLoginAt ? dateFormat.format(new Date(row.original.lastLoginAt)) : "Never",
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Actions</span>,
          cell: ({ row }) => {
            const member = row.original;
            if (!canManage || member.isSelf) return null;
            return (
              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setPending({ kind: "role", member })}>
                      Change role
                    </DropdownMenuItem>
                    {member.status === "INVITED" ? (
                      <DropdownMenuItem onSelect={() => void resend(member)}>
                        Resend invitation
                      </DropdownMenuItem>
                    ) : null}
                    {member.status === "ACTIVE" ? (
                      <DropdownMenuItem onSelect={() => setPending({ kind: "suspend", member })}>
                        Suspend access
                      </DropdownMenuItem>
                    ) : null}
                    {member.status === "SUSPENDED" ? (
                      <DropdownMenuItem onSelect={() => setPending({ kind: "reactivate", member })}>
                        Reactivate access
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setPending({ kind: "remove", member })}
                    >
                      Remove from company
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          },
        }),
      ]),
    [canManage, dateFormat],
  );

  const member = pending?.member;
  return (
    <div className="space-y-3">
      <FilterBar
        search={
          <SearchInput
            label="Search users"
            placeholder="Search name or email…"
            defaultValue={searchParams.get("search") ?? ""}
            onSearch={(value) => setQuery({ search: value || null, page: null })}
          />
        }
      />
      <DataTable
        caption="Company users"
        columns={columns}
        data={members}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState size="compact" title="No users found" description="Try a different search." />
        }
      />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={(next) => setQuery({ page: String(next) })}
      />

      {member && pending?.kind === "role" ? (
        <ChangeRoleDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          membershipId={member.id}
          memberName={member.name}
          currentRoleId={member.roleId}
          roles={assignableRoles}
        />
      ) : null}
      {member && pending && pending.kind !== "role" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          tone={pending.kind === "reactivate" ? "default" : "destructive"}
          title={
            pending.kind === "remove"
              ? `Remove ${member.name} from the company?`
              : pending.kind === "suspend"
                ? `Suspend ${member.name}?`
                : `Reactivate ${member.name}?`
          }
          description={
            pending.kind === "remove"
              ? "They lose access to this company immediately. Their account and records they created stay."
              : pending.kind === "suspend"
                ? "They can't access this company until reactivated. Nothing is deleted."
                : "They regain access with their current role."
          }
          confirmLabel={
            pending.kind === "remove" ? "Remove" : pending.kind === "suspend" ? "Suspend" : "Reactivate"
          }
          onConfirm={() =>
            pending.kind === "remove"
              ? run(removeMemberAction(member.id), `${member.name} was removed.`)
              : run(
                  setMemberSuspendedAction(member.id, pending.kind === "suspend"),
                  pending.kind === "suspend"
                    ? `${member.name} was suspended.`
                    : `${member.name} was reactivated.`,
                )
          }
        />
      ) : null}
    </div>
  );
}
