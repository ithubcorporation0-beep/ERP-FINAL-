import type { Metadata } from "next";
import { Plus } from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ProjectFilters } from "@/features/projects/filters";
import { ProjectList } from "@/features/projects/project-list";
import { toProjectRow } from "@/features/projects/rows";
import { authorizePage } from "@/lib/auth/page";
import { can } from "@/lib/tenant";
import { projectListQuerySchema } from "@/lib/validation";
import { companyService } from "@/server/services/company.service";
import { projectService } from "@/server/services/project.service";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  // Server-side check: hiding the menu link is not protection.
  const ctx = await authorizePage("projects:view");
  if (!ctx) return <AccessDenied />;

  const query = projectListQuerySchema.catch(projectListQuerySchema.parse({})).parse(await searchParams);
  const [result, format] = await Promise.all([
    projectService.list(ctx, query),
    companyService.formatting(ctx),
  ]);
  const canCreate = can(ctx, "projects:create");

  return (
    <>
      <PageHeader
        title="Projects"
        description={
          projectService.seesAll(ctx)
            ? "Every project with its customer, manager, deadline and progress."
            : "Projects you manage or have tasks in."
        }
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus aria-hidden="true" />
                New project
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <ProjectFilters />
        <ProjectList
          rows={result.items.map((project) => toProjectRow(project, format))}
          total={result.total}
          page={result.page}
          pageSize={result.pageSize}
          canCreate={canCreate}
        />
      </div>
    </>
  );
}
