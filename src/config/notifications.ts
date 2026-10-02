import type { PermissionKey } from "@/lib/permissions";

/**
 * Notification types, who receives them and the default channels. Users change the channels per type on
 * /notifications/preferences. Rules: docs/notifications.md.
 */

export const NOTIFICATION_TYPES = [
  "invoice.created",
  "invoice.overdue",
  "payment.received",
  "task.assigned",
  "task.deadline",
  "leave.requested",
  "leave.decided",
  "inventory.low_stock",
  "customer.created",
  "project.deadline",
] as const;
export type NotificationTypeKey = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationTypeDefinition {
  label: string;
  /** Who gets it, in plain words (shown on the preferences page). */
  audience: string;
  /**
   * Members with this permission receive it ("broadcast" types). Types sent to specific people (an assignee, a
   * requester, a project manager) leave it out.
   */
  permission?: PermissionKey;
  /** Default channels when the user hasn't chosen. */
  defaults: { inApp: boolean; email: boolean };
}

export const NOTIFICATION_TYPE_DEFINITIONS: Record<NotificationTypeKey, NotificationTypeDefinition> = {
  "invoice.created": {
    label: "New invoice",
    audience: "People who can see invoices",
    permission: "invoices:view",
    defaults: { inApp: true, email: false },
  },
  "invoice.overdue": {
    label: "Invoice overdue",
    audience: "People who can see invoices",
    permission: "invoices:view",
    defaults: { inApp: true, email: true },
  },
  "payment.received": {
    label: "Payment received",
    audience: "People who can see payments",
    permission: "payments:view",
    defaults: { inApp: true, email: false },
  },
  "task.assigned": {
    label: "New task assigned to you",
    audience: "The employee the task is assigned to",
    defaults: { inApp: true, email: true },
  },
  "task.deadline": {
    label: "Task deadline",
    audience: "The assignee (and the project manager) when a task is due tomorrow, today or overdue",
    defaults: { inApp: true, email: true },
  },
  "leave.requested": {
    label: "Leave request",
    audience: "People who approve leave",
    permission: "leaves:approve",
    defaults: { inApp: true, email: true },
  },
  "leave.decided": {
    label: "Leave approved or rejected",
    audience: "The employee who requested the leave",
    defaults: { inApp: true, email: true },
  },
  "inventory.low_stock": {
    label: "Low inventory",
    audience: "People who can see products",
    permission: "products:view",
    defaults: { inApp: true, email: false },
  },
  "customer.created": {
    label: "New customer",
    audience: "People who can see customers",
    permission: "customers:view",
    defaults: { inApp: true, email: false },
  },
  "project.deadline": {
    label: "Project deadline",
    audience: "The project manager and people who edit projects, 3 days before the end date and when overdue",
    defaults: { inApp: true, email: true },
  },
};

export function isNotificationType(value: string): value is NotificationTypeKey {
  return NOTIFICATION_TYPES.some((type) => type === value);
}

/** Channels that exist today. WhatsApp and SMS are planned (docs/notifications.md) and not implemented. */
export const NOTIFICATION_CHANNELS = ["inApp", "email"] as const;
export type NotificationChannelKey = (typeof NOTIFICATION_CHANNELS)[number];
export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannelKey, string> = {
  inApp: "In the app",
  email: "Email",
};

/** Tasks due within this many days get a deadline reminder (tomorrow or today), and again when overdue. */
export const TASK_REMINDER_DAYS = 1;
/** Projects get a reminder this many days before their end date, and again when overdue. */
export const PROJECT_REMINDER_DAYS = 3;
/** Failed emails are retried this many times, with growing delays. */
export const MAX_EMAIL_ATTEMPTS = 5;
