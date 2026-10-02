# Notifications (phase 13)

What the app notifies people about, who receives each notification, how email delivery works and what is not built
yet. Code: `src/config/notifications.ts` (types), `src/lib/notifications.ts` (pure rules),
`src/server/services/notification.service.ts` and `notification-schedule.service.ts`.

## Types and who receives them

| Type                  | When                                                                                 | Who receives it                                      | Default        |
| --------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- | -------------- |
| `invoice.created`     | An invoice is created (or converted from a quotation/order)                          | Members with `invoices:view`                         | in-app         |
| `invoice.overdue`     | A sent or partly paid invoice is past its due date (scheduled check, once)           | Members with `invoices:view`                         | in-app + email |
| `payment.received`    | A customer payment is recorded                                                       | Members with `payments:view`                         | in-app         |
| `task.assigned`       | A task is created for someone or reassigned to them                                  | The assignee (through their linked login)            | in-app + email |
| `task.deadline`       | An open task is due tomorrow or today ("upcoming"), then once it is late ("overdue") | The assignee and the project manager                 | in-app + email |
| `leave.requested`     | A leave request is submitted                                                         | Members with `leaves:approve`                        | in-app + email |
| `leave.decided`       | A leave request is approved or rejected                                              | The employee (through their linked login)            | in-app + email |
| `inventory.low_stock` | A stock movement takes a product (all warehouses) to or below its minimum            | Members with `products:view`                         | in-app         |
| `customer.created`    | A customer is created (or a lead converted)                                          | Members with `customers:view`                        | in-app         |
| `project.deadline`    | An open project ends within 3 days ("upcoming"), then once it is late ("overdue")    | The project manager and members with `projects:edit` | in-app + email |

Rules that apply to every type:

- **Never the person who caused it.** Creating a customer doesn't notify you about your own customer; HR filing leave
  for someone notifies neither HR nor that employee about the request.
- **Only active members** of the company, and only people who would be allowed to open the record.
- **Same transaction as the event.** Notifications are written inside the transaction that creates the invoice,
  records the payment, etc. If the event fails and rolls back, its notifications disappear with it.
- Low stock is sent when the total **crosses** into low, not on every movement while it stays low.
- Employees receive task and leave notifications only when their login is linked to their employee record.

## Notification center and read state

- **Bell** in the header: the real unread count, and a dropdown with the latest notifications (loaded when it
  opens). Opening one marks it read and goes to the record; "Mark all as read" clears the count.
- **`/notifications`**: all your notifications with filters (unread, type), mark read / unread per item, mark all as
  read, pagination.
- Every user sees and changes **only their own** notifications, in the current company. Someone else's id is simply
  not found.

## Preferences

`/notifications/preferences` (also "Settings" in the bell): per type, **In the app** and **Email** on or off. Until a
user saves a choice, the defaults in the table above apply. Saving is recorded in the audit log
(`notification.preferences_update`). WhatsApp and SMS are shown as "Coming later".

## Email delivery (outbox)

Emails are not sent inside the business transaction (a slow mail server must not block saving an invoice). Instead:

1. `notify()` writes a row to **`email_outbox`** (status `PENDING`) in the event's transaction.
2. The **dispatcher** (`notificationService.dispatchEmails`) picks due rows with `FOR UPDATE SKIP LOCKED`, so two
   runs at the same time never send the same email, and sends them with the configured transport (`EMAIL_TRANSPORT`).
3. Success → `SENT` with the time. Failure → the error is logged and stored, and the email is retried after 1, 5, 25,
   125… minutes (at most 12 hours). After **5** failed attempts it becomes `FAILED` and is not retried.

Email text is plain: the title, the details and a link back into the app. It never includes restricted data
(salaries, bank details).

## Scheduled checks and the scheduler

Overdue invoices and task/project deadlines are time-based, so something must run the checks regularly. Each run
does, for every active company in **its own time zone**: overdue invoices, task deadlines, project deadlines; then it
delivers queued emails. **Dedupe keys** (`type:record:date:stage`, unique per user) make runs safe to repeat. Running
every 5–15 minutes is fine; each reminder is still sent once. Moving a due date creates a new reminder for the new
date.

Two ways to run it:

- **HTTP:** `POST /api/cron/notifications` with `Authorization: Bearer <CRON_SECRET>`. Set `CRON_SECRET` (at least
  32 random characters, e.g. `openssl rand -hex 32`). Without `CRON_SECRET` the endpoint answers 404, and a wrong
  secret gets 401. Point any cron service (Vercel Cron, GitHub Actions, a server crontab with `curl`) at it.
- **Command:** `npm run notifications:run` on a server with access to the database (e.g. a crontab entry).

One company failing (e.g. bad data) is logged and does not stop the others.

## Adding a notification type

1. Add the key to `NOTIFICATION_TYPES` and its definition (label, audience, permission or specific users, defaults)
   in `src/config/notifications.ts`.
2. Call `notify(companyId, { type, title, body, link, entityType, entityId, excludeUserIds | userIds }, tx)` inside
   the service transaction that causes it; for time-based ones, add a check to `notification-schedule.service.ts`
   with a `dedupeKey()`.
3. Add tests (recipients, actor excluded, preferences) to `tests/integration/notifications.test.ts`.

## Not implemented

- **WhatsApp and SMS.** Planned as further outbox channels (`OutboxChannel` has only `EMAIL`): a provider adapter
  next to `src/lib/email`, a phone number per user, and a column on the preferences page.
- Push / browser notifications, real-time updates (the bell refreshes on navigation and when opened), daily digests.
- Notifications for every other event (quotations, expenses, purchases, payroll…) — add types as needed.
- Cleaning up old notifications and sent outbox rows (they are kept).
