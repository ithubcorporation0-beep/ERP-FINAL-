import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { projectListQuerySchema, projectSchema } from "@/lib/validation";
import { projectService } from "@/server/services/project.service";

/** Projects with progress. People who don't manage projects only get the ones they manage or work on. */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("projects:view");
  const query = projectListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await projectService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("projects:create");
  return NextResponse.json(await projectService.create(ctx, projectSchema.parse(await req.json())), {
    status: 201,
  });
});
