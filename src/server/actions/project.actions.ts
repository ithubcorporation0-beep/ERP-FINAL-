"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/lib/action";
import { requirePermission } from "@/lib/tenant";
import { idSchema, projectSchema, taskAssignSchema, taskSchema, taskStatusSchema } from "@/lib/validation";
import { projectService } from "@/server/services/project.service";
import { taskService } from "@/server/services/task.service";

const PROJECTS = "/projects";

function revalidateProjects() {
  // Projects, tasks, board and reports all live under /projects.
  revalidatePath(PROJECTS, "layout");
  revalidatePath("/dashboard");
}

export async function createProjectAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("projects:create");
    const project = await projectService.create(ctx, projectSchema.parse(input));
    revalidateProjects();
    return { id: project.id };
  });
}

export async function updateProjectAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("projects:edit");
    await projectService.update(ctx, idSchema.parse(id), projectSchema.parse(input));
    revalidateProjects();
  });
}

export async function deleteProjectAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("projects:delete");
    await projectService.remove(ctx, idSchema.parse(id));
    revalidateProjects();
  });
}

export async function createTaskAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await requirePermission("tasks:create");
    const task = await taskService.create(ctx, taskSchema.parse(input));
    revalidateProjects();
    return { id: task.id };
  });
}

export async function updateTaskAction(id: unknown, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("tasks:edit");
    await taskService.update(ctx, idSchema.parse(id), taskSchema.parse(input));
    revalidateProjects();
  });
}

/** Moves a task to another status (board drag and drop, "Move to" menu, detail page). */
export async function setTaskStatusAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("tasks:edit");
    const { id, status } = taskStatusSchema.parse(input);
    await taskService.setStatus(ctx, id, status);
    revalidateProjects();
  });
}

export async function assignTaskAction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("tasks:edit");
    const { id, assigneeId } = taskAssignSchema.parse(input);
    await taskService.assign(ctx, id, assigneeId || null);
    revalidateProjects();
  });
}

export async function deleteTaskAction(id: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requirePermission("tasks:delete");
    await taskService.remove(ctx, idSchema.parse(id));
    revalidateProjects();
  });
}
