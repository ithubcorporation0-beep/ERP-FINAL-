import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { taskAssignSchema } from "@/lib/validation";
import { taskService } from "@/server/services/task.service";

type Context = RouteContext<"/api/tasks/[id]/assign">;

/** Assigns `{ assigneeId }` ("" unassigns) — task managers only. */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:edit");
  const id = routeId((await params).id, "Task");
  const { assigneeId } = taskAssignSchema.parse({ ...(await req.json()), id });
  await taskService.assign(ctx, id, assigneeId || null);
  return new NextResponse(null, { status: 204 });
});
