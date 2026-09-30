import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { taskListQuerySchema } from "@/lib/validation";
import { taskService } from "@/server/services/task.service";

/** Tasks for the Kanban board (`?projectId=&assigneeId=&mine=1`), urgent first. */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("tasks:view");
  const query = taskListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(
    await taskService.board(ctx, {
      projectId: query.projectId,
      assigneeId: query.assigneeId,
      mine: query.mine === "1",
    }),
  );
});
