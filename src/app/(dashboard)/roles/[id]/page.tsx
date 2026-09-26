import { Copy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { SuccessMessage } from "@/components/shared/success-message";
import { Button } from "@/components/ui/button";
import { DeleteRoleButton } from "@/features/roles/delete-role-button";
import { PermissionMatrix } from "@/features/roles/permission-matrix";
import { RoleEditor } from "@/features/roles/role-editor";
import { authorizePage } from "@/lib/auth/page";
import { can, grantablePermissions } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";
import { roleService } from "@/server/services/role.service";

export const metadata: Metadata = { title: "Role" };

export default async function RolePage({ params, searchParams }: PageProps<"/roles/[id]">) {
  const ctx = await authorizePage("roles:view");
  if (!ctx) return <AccessDenied />;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const role = await roleService.get(ctx, id.data).catch(() => null);
  if (!role) notFound();

  const canManage = can(ctx, "roles:manage");
  const grantable = new Set<string>(grantablePermissions(ctx));
  // Editing is allowed only for custom roles whose current permissions the editor holds too.
  const editable = canManage && !role.isSystem && role.permissions.every((key) => grantable.has(key));
  const saved = (await searchParams).saved === "1";

  return (
    <div className="space-y-6">
      <PageHeader
        title={role.name}
        description={role.description ?? undefined}
        actions={
          <>
            {role.isSystem ? (
              <StatusBadge tone="neutral">Built-in</StatusBadge>
            ) : (
              <StatusBadge tone="info">Custom</StatusBadge>
            )}
            {canManage ? (
              <Button asChild variant="outline">
                <Link href={`/roles/new?from=${role.id}`}>
                  <Copy aria-hidden="true" />
                  Duplicate
                </Link>
              </Button>
            ) : null}
            {editable ? <DeleteRoleButton roleId={role.id} roleName={role.name} /> : null}
          </>
        }
      />
      {saved ? <SuccessMessage message="The role was created." /> : null}
      <p className="text-sm text-muted-foreground" data-numeric>
        Assigned to {role.memberCount} member{role.memberCount === 1 ? "" : "s"}.{" "}
        {role.isSystem ? "Built-in roles can't be changed — duplicate one to customize it." : null}
      </p>
      {editable ? (
        <RoleEditor
          roleId={role.id}
          defaults={{ name: role.name, description: role.description ?? "", permissions: role.permissions }}
          grantable={[...grantable]}
        />
      ) : (
        <PermissionMatrix selected={new Set(role.permissions)} grantable={new Set()} readOnly />
      )}
    </div>
  );
}
