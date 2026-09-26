import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { RoleEditor } from "@/features/roles/role-editor";
import { authorizePage } from "@/lib/auth/page";
import { grantablePermissions } from "@/lib/tenant";
import { idSchema } from "@/lib/validation";
import { roleService } from "@/server/services/role.service";

export const metadata: Metadata = { title: "New role" };

export default async function NewRolePage({ searchParams }: PageProps<"/roles/new">) {
  const ctx = await authorizePage("roles:manage");
  if (!ctx) return <AccessDenied />;

  // "Duplicate": /roles/new?from=<roleId> pre-fills the permissions of an existing role.
  const from = idSchema.safeParse((await searchParams).from);
  const source = from.success ? await roleService.get(ctx, from.data).catch(() => null) : null;
  const grantable: string[] = grantablePermissions(ctx);

  return (
    <>
      <PageHeader
        title={source ? `New role based on ${source.name}` : "New role"}
        description="Choose a name and the permissions this role grants."
      />
      <RoleEditor
        defaults={{
          name: source ? `${source.name} (copy)` : "",
          description: source?.description ?? "",
          permissions: source ? source.permissions.filter((key) => grantable.includes(key)) : [],
        }}
        grantable={grantable}
      />
    </>
  );
}
