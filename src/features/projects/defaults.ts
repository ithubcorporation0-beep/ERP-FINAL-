import type { ProjectInput, TaskInput } from "@/lib/validation";

/** Form defaults, outside "use client" modules so server pages can spread them. */
export function emptyProject(today: string): ProjectInput {
  return {
    name: "",
    customerId: "",
    managerId: "",
    startDate: today,
    endDate: "",
    budget: "",
    status: "PLANNING",
    description: "",
  };
}

export function emptyTask(projectId: string): TaskInput {
  return {
    name: "",
    projectId,
    assigneeId: "",
    priority: "MEDIUM",
    status: "TODO",
    startDate: "",
    dueDate: "",
    description: "",
  };
}
