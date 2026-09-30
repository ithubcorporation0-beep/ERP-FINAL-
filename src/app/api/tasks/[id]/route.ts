import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { taskSchema } from "@/lib/validation";
import { taskService } from "@/server/services/task.service";

type Context = RouteContext<"/api/tasks/[id]">;

export const GET = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:view");
  return NextResponse.json(await taskService.get(ctx, routeId((await params).id, "Task")));
});

/** Full edit — task managers only (checked in the service). */
export const PUT = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:edit");
  await taskService.update(ctx, routeId((await params).id, "Task"), taskSchema.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async (_req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:delete");
  await taskService.remove(ctx, routeId((await params).id, "Task"));
  return new NextResponse(null, { status: 204 });
});
