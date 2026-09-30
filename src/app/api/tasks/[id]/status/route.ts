import { NextResponse } from "next/server";
import { handle, routeId } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { taskStatusSchema } from "@/lib/validation";
import { taskService } from "@/server/services/task.service";

type Context = RouteContext<"/api/tasks/[id]/status">;

/** Moves a task `{ status }` — anyone with tasks:edit on the tasks they can see (409 if someone moved it meanwhile). */
export const POST = handle(async (req: Request, { params }: Context) => {
  const ctx = await requirePermission("tasks:edit");
  const id = routeId((await params).id, "Task");
  const { status } = taskStatusSchema.parse({ ...(await req.json()), id });
  await taskService.setStatus(ctx, id, status);
  return new NextResponse(null, { status: 204 });
});
