# Projects and tasks (phase 11)

What the projects module does, the exact rules it applies, and what it does **not** do.

## Projects

`PRJ-0001`. Fields: name, customer (optional), manager (a current employee, optional), start date, end date, budget
(company currency, exact decimal), status, description.

| Status    | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| Planning  | Not started. Open: tasks can be added and changed.                   |
| Active    | Being worked on. Open.                                               |
| On hold   | Paused. Open (deadlines still count).                                |
| Completed | Finished. `completed_at` is set. Tasks are read only until reopened. |
| Cancelled | Stopped. Tasks are read only until reopened.                         |

- The end date can't be before the start date; the budget can't be negative (also database CHECKs).
- Completed ⇔ `completed_at` set (database CHECK), so reports can't show a "completed" project without a date.
- A project **with tasks can't be deleted** — complete or cancel it instead. An empty project can be deleted
  (soft delete).
- A customer's page lists that customer's projects (tab "Projects"), with a "New project" shortcut.

## Tasks

`TSK-0001`. Fields: name, project, assigned employee (optional), priority (Low / Medium / High / Urgent), start date,
due date, status (To do / In progress / Review / Completed), description, attachments.

- The due date can't be before the start date (database CHECK). Completed ⇔ `completed_at` set.
- New tasks only go into open projects; tasks of completed or cancelled projects can't be changed, moved or get
  attachments until the project is reopened.
- **Attachments**: PDF, images, Word, Excel, CSV or text, up to 10 MB, checked by content (not by file name), stored
  under `companies/<companyId>/tasks/<taskId>/`. Task managers may delete any attachment; everyone else only what
  they uploaded.

## Kanban board

`/projects/board`: one column per task status. Move a card by **dragging** it to another column, or with its
**"Move to" menu** (keyboard, screen reader and touch friendly — drag and drop alone isn't accessible). The move
shows immediately and is saved on the server; if saving fails (no permission, project closed, or someone else moved
the card first) the card goes back and a message explains why.

- **Stale moves are refused**: the update only applies if the task still has the status the user saw, so two people
  moving the same card never silently overwrite each other ("Someone else changed this task. Reload and try again.").
- Within a column, cards are ordered by priority (urgent first), then due date. There is no manual ordering.
- The board shows up to 500 tasks; filter by project for more.

## Progress and deadlines

Rules are pure functions in `src/lib/projects.ts` (unit-tested in `tests/unit/projects.test.ts`); dates are calendar
dates in the company time zone.

| Figure          | Rule                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Work done       | Completed tasks ÷ all tasks, whole percent **rounded down** (100% only when every task is done). None if no tasks. |
| Time elapsed    | Days passed since the start ÷ planned days (start → end), 0–100%. Needs both dates; shown for open projects only.  |
| Behind schedule | Open project whose time elapsed is greater than its work done.                                                     |
| Project overdue | Open project (Planning, Active, On hold) after its end date.                                                       |
| Task overdue    | Not completed and past its due date.                                                                               |
| Due today       | Not completed and due today.                                                                                       |
| Due soon        | Not completed and due within the next 3 days (`DUE_SOON_DAYS`).                                                    |

Deadlines are always shown in words ("Overdue", "Due soon"), never by color alone.

## Who sees what

| Who                                                                        | Projects                              | Tasks                                                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projects:create` / `edit` / `delete` (Manager, Admin, Super Admin)        | All                                   | —                                                                                                                                                       |
| Task managers: `tasks:create` or `projects:edit` (Manager, Admin)          | —                                     | All; create, edit, assign, delete                                                                                                                       |
| Everyone else with `projects:view` / `tasks:view` (e.g. the Employee role) | Projects they manage or have tasks in | Tasks assigned to them or in projects they manage; with `tasks:edit` they move the status and add attachments, but can't edit, assign, create or delete |

"Their own" is resolved through the employee record linked to the login (HR → employee → Login). A user without a
linked employee record who isn't a manager sees no projects or tasks. Anything outside a person's scope is "not
found" (404), in pages and the API; other companies' records are always 404.

## Audit

Every change is in the audit log, in the same transaction: project created / updated (with "Active → Completed"
status summaries) / deleted; task created / updated / status changed ("To do → In progress") / assigned ("Assigned
to …") / attachment added / attachment deleted / deleted. Project and task pages show this history.

## Dashboard

"Active projects" and "Pending tasks" (open tasks) figures, the "Projects by status" chart and the "Project
updates" feed are real, and scoped exactly like the pages (an employee sees only their own work). The "Create
project" quick action opens the project form.

## Reports

`/projects/reports`: open projects, projects past their end date, projects behind schedule, overdue tasks; projects
per status; progress and deadlines of open projects; open work per person (open, overdue and urgent tasks); closed
projects.

## Not implemented

- Budget vs. actual cost (expenses and time aren't linked to projects), invoicing from projects.
- Time tracking / timesheets, task dependencies, sub-tasks, milestones, Gantt chart, recurring tasks.
- Manual card ordering within a board column; comments on tasks.
- Customer portal view of project status (phase 15).
