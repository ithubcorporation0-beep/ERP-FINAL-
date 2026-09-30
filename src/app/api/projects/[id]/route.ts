import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { projectSchema } from "@/lib/validation";
import { projectService } from "@/server/services/project.service";

type Context = RouteContext<"/api/projects/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("projects:view");
  return NextResponse.json(await projectService.detail(ctx, routeId((await params).id, "Project")));
});

export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("projects:edit");
  await projectService.update(
    ctx,
    routeId((await params).id, "Project"),
    projectSchema.parse(await req.json()),
  );
  return new NextResponse(null, { status: 204 });
});

/** Only projects without tasks can be deleted (complete or cancel the others). */
export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("projects:delete");
  await projectService.remove(ctx, routeId((await params).id, "Project"));
  return new NextResponse(null, { status: 204 });
});
