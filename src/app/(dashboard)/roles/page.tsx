import { Plus, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { SuccessMessage } from "@/components/shared/success-message";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { roleService } from "@/server/services/role.service";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage({ searchParams }: PageProps<"/roles">) {
  const ctx = await authorizePage("roles:view");
  if (!ctx) return <AccessDenied />;
  const [roles, params] = await Promise.all([roleService.list(ctx), searchParams]);

  return (
    <>
      <PageHeader
        title="Roles"
        description="A role is a set of permissions. Each user has one role per company."
        actions={
          can(ctx, "roles:manage") ? (
            <Button asChild>
              <Link href="/roles/new">
                <Plus aria-hidden="true" />
                New role
              </Link>
            </Button>
          ) : undefined
        }
      />
      {params.deleted === "1" ? <SuccessMessage message="The role was deleted." /> : null}
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {roles.map((role) => (
          <li key={role.id}>
            <Card className="relative h-full gap-3 p-5 shadow-xs transition-colors hover:border-primary/40">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/roles/${role.id}`}
                  className="flex items-center gap-2 font-semibold after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none"
                >
                  <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                  {role.name}
                </Link>
                {role.isSystem ? (
                  <StatusBadge tone="neutral">Built-in</StatusBadge>
                ) : (
                  <StatusBadge tone="info">Custom</StatusBadge>
                )}
              </div>
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {role.description ?? "No description."}
              </p>
              <p className="mt-auto text-xs text-muted-foreground" data-numeric>
                {role.memberCount} member{role.memberCount === 1 ? "" : "s"} · {role.permissions.length}{" "}
                permission
                {role.permissions.length === 1 ? "" : "s"}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
