import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { taskListQuerySchema, taskSchema } from "@/lib/validation";
import { taskService } from "@/server/services/task.service";

/** Tasks (`?projectId=&assigneeId=&status=open&priority=&due=overdue|soon&mine=1`). Employees get their own. */
export const GET = handle(async (req: Request) => {
  const ctx = await requirePermission("tasks:view");
  const query = taskListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await taskService.list(ctx, query));
});

export const POST = handle(async (req: Request) => {
  const ctx = await requirePermission("tasks:create");
  return NextResponse.json(await taskService.create(ctx, taskSchema.parse(await req.json())), {
    status: 201,
  });
});
