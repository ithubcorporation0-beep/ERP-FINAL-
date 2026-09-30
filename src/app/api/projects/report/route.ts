import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { projectService } from "@/server/services/project.service";

/** Project report: progress and deadlines per project, projects per status, open work per assignee. */
export const GET = handle(async () => {
  const ctx = await requirePermission("projects:view");
  return NextResponse.json(await projectService.report(ctx));
});
