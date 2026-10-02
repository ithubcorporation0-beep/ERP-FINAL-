import "server-only";
import { PROJECT_REMINDER_DAYS, TASK_REMINDER_DAYS } from "@/config/notifications";
import { formatRecordNumber } from "@/config/records";
import { addDays, dateOnlyToDate, dateToDateOnly, todayInZone } from "@/lib/date-range";
import { logger } from "@/lib/logger";
import { money, subtractMoney } from "@/lib/money";
import { deadlineLabel, deadlineStage, dedupeKey } from "@/lib/notifications";
import { companyRepository } from "@/server/repositories/company.repository";
import { invoiceRepository } from "@/server/repositories/invoice.repository";
import { membershipRepository } from "@/server/repositories/membership.repository";
import { projectRepository } from "@/server/repositories/project.repository";
import { taskRepository } from "@/server/repositories/task.repository";
import { notify } from "./notification.service";

/**
 * Time-based notifications, run by the scheduler (cron route or `npm run notifications:run`), for every active
 * company in its own time zone:
 * - invoice overdue — once per invoice;
 * - task deadline — "upcoming" (due tomorrow or today) and "overdue", once each per due date;
 * - project deadline — "upcoming" (3 days before the end date) and "overdue", once each per end date.
 * Dedupe keys make the checks safe to run as often as you like (every few minutes is fine).
 */

async function checkCompany(companyId: string, today: string) {
  const counts = { invoices: 0, tasks: 0, projects: 0 };

  for (const invoice of await invoiceRepository.listOverdue(companyId, dateOnlyToDate(today))) {
    const due = dateToDateOnly(invoice.dueDate);
    const balance = subtractMoney(money(invoice.total), money(invoice.amountPaid));
    const result = await notify(companyId, {
      type: "invoice.overdue",
      title: `Invoice ${invoice.code} is overdue`,
      body: `${invoice.customer.name} still owes ${invoice.currency} ${balance}; it was due on ${due}.`,
      link: `/sales/invoices/${invoice.id}`,
      entityType: "Invoice",
      entityId: invoice.id,
      dedupeKey: dedupeKey("invoice.overdue", invoice.id),
    });
    counts.invoices += result.inApp + result.email;
  }

  for (const task of await taskRepository.listDueForReminder(
    companyId,
    dateOnlyToDate(addDays(today, TASK_REMINDER_DAYS)),
  )) {
    if (!task.dueDate) continue;
    const due = dateToDateOnly(task.dueDate);
    const stage = deadlineStage(due, today, TASK_REMINDER_DAYS);
    if (!stage) continue;
    const userIds = [task.assignee?.userId, task.project.manager?.userId].flatMap((id) => (id ? [id] : []));
    const result = await notify(companyId, {
      type: "task.deadline",
      title: `Task ${formatRecordNumber("task", task.number)} is ${deadlineLabel(due, today)}`,
      body: `“${task.name}” in ${task.project.name}.`,
      link: `/projects/tasks/${task.id}`,
      entityType: "Task",
      entityId: task.id,
      dedupeKey: dedupeKey("task.deadline", task.id, due, stage),
      userIds,
    });
    counts.tasks += result.inApp + result.email;
  }

  const editors = await membershipRepository.listUsersWithPermission(companyId, "projects:edit");
  for (const project of await projectRepository.listEndingForReminder(
    companyId,
    dateOnlyToDate(addDays(today, PROJECT_REMINDER_DAYS)),
  )) {
    if (!project.endDate) continue;
    const end = dateToDateOnly(project.endDate);
    const stage = deadlineStage(end, today, PROJECT_REMINDER_DAYS);
    if (!stage) continue;
    const userIds = [
      ...editors.map((user) => user.id),
      ...(project.manager?.userId ? [project.manager.userId] : []),
    ];
    const result = await notify(companyId, {
      type: "project.deadline",
      title: `Project ${project.name} is ${deadlineLabel(end, today)}`,
      body: `${formatRecordNumber("project", project.number)} ends on ${end}.`,
      link: `/projects/${project.id}`,
      entityType: "Project",
      entityId: project.id,
      dedupeKey: dedupeKey("project.deadline", project.id, end, stage),
      userIds,
    });
    counts.projects += result.inApp + result.email;
  }
  return counts;
}

export const notificationScheduleService = {
  checkCompany,

  /** Runs the checks for every active company. One company's failure is logged and doesn't stop the others. */
  async runAll(now = new Date()) {
    const companies = await companyRepository.listActiveForSchedule();
    const results: Array<{ companyId: string; created?: number; error?: string }> = [];
    for (const company of companies) {
      try {
        const counts = await checkCompany(company.id, todayInZone(company.timezone, now));
        results.push({ companyId: company.id, created: counts.invoices + counts.tasks + counts.projects });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("Scheduled notification checks failed", { companyId: company.id, error: message });
        results.push({ companyId: company.id, error: message });
      }
    }
    return results;
  },
};
