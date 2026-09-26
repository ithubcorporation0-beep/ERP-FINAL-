import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { MembersTable } from "@/features/users/members-table";
import { InviteMemberDialog } from "@/features/users/invite-member-dialog";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { paginationSchema } from "@/lib/validation";
import { memberService } from "@/server/services/member.service";
import { roleService } from "@/server/services/role.service";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const ctx = await authorizePage("users:view");
  if (!ctx) return <AccessDenied />;

  const query = paginationSchema.catch({ page: 1, pageSize: 20 }).parse(await searchParams);
  const canManage = can(ctx, "users:manage");
  const [members, assignable] = await Promise.all([
    memberService.list(ctx, query),
    canManage ? roleService.assignable(ctx) : Promise.resolve([]),
  ]);
  const roleOptions = assignable.map((role) => ({ value: role.id, label: role.name }));

  return (
    <>
      <PageHeader
        title="Users"
        description="People with access to this company, their roles and status."
        actions={canManage ? <InviteMemberDialog roles={roleOptions} /> : undefined}
      />
      <MembersTable
        members={members.items.map((member) => ({
          id: member.id,
          name: member.user.name,
          email: member.user.email,
          roleId: member.roleId,
          roleName: member.role.name,
          status: member.status,
          lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null,
          isSelf: member.user.id === ctx.userId,
        }))}
        total={members.total}
        page={members.page}
        pageSize={members.pageSize}
        canManage={canManage}
        assignableRoles={roleOptions}
      />
    </>
  );
}
