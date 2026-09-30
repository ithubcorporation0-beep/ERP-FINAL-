# Authentication and permissions

IT Hub ERP uses its **own authentication** (no third-party provider — see ADR-003 and ADR-019): passwords are
hashed with bcrypt, sessions are random tokens stored hashed in PostgreSQL, and every decision is made on the
server. **Hiding a button or menu item is never the protection** — each page, server action, API route and
service checks permissions itself.

## Account features

| Feature            | Where                          | Notes                                                                                              |
| ------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Sign in            | `/login`                       | Generic "invalid email or password" for unknown emails and wrong passwords                         |
| Lockout            | —                              | 5 consecutive failures → locked 15 minutes (reset by a successful sign-in or password reset)       |
| Sign out           | User menu                      | Deletes the session in the database                                                                |
| Registration       | `/register`                    | Only when `AUTH_ALLOW_REGISTRATION=true`. Creates a new company with the registrant as Super Admin |
| Email verification | `/verify-email?token=…`        | Required before signing in (self-registered accounts). Link valid 24 h, used once                  |
| Forgot password    | `/forgot-password`             | Same answer whether or not the email exists. Throttled to 1 email/minute per account               |
| Reset password     | `/reset-password?token=…`      | Link valid 1 h, used once; only the newest link works; signs out every session                     |
| Invitations        | Users page → Invite            | New people get an INVITED account and a 7-day link to set their name and password                  |
| Change password    | `/profile`                     | Requires the current password; signs out all _other_ sessions                                      |
| Profile            | `/profile`                     | Name, job title, phone; email is changed by an administrator                                       |
| Sessions           | `/profile` → Signed-in devices | Lists devices; sign out one or all others                                                          |

**Sessions:** HTTP-only, `SameSite=Lax`, `Secure` in production. A session ends after **7 days without activity**
and after **30 days at most** (`sessions.absolute_expires_at`). Signing in always creates a new token (prevents
session fixation). Suspending a membership removes access to that company on the next request.

**Email links** (verification, reset, invitation) are single-use random tokens; only their SHA-256 hash is stored in
`auth_tokens`. Pages never consume a token on page load — the user must press a button — so email security scanners
that open links can't use them up.

**Password policy:** 12–128 characters, no leading/trailing spaces, not equal to the email address (NIST SP 800-63B:
length over complexity rules). Checked in the browser and again on the server.

## Model

```
permissions (global)  ◄── role_permissions (company_id) ──►  roles (company_id)  ◄── memberships (company_id) ──► users
```

- A **permission** is a key `module:action`, e.g. `invoices:create`. All keys are listed explicitly in
  `PERMISSION_KEYS` (`src/lib/permissions/index.ts`) — these are the **permission constants**; TypeScript rejects
  any key that doesn't exist.
- The seed syncs the list into the `permissions` table (currently **108** keys), deleting retired keys.
- **Roles belong to one company**; their permissions are rows in `role_permissions`.
- A user's **membership** in a company points to exactly one role of that company (enforced by composite
  foreign keys).

### Actions

| Action    | Meaning                         | Exists for                                        |
| --------- | ------------------------------- | ------------------------------------------------- |
| `view`    | See records / open the module   | every module                                      |
| `create`  | Add records                     | business modules                                  |
| `edit`    | Change records                  | business modules                                  |
| `delete`  | Delete / void records           | business modules                                  |
| `export`  | Download data (CSV, Excel, PDF) | business modules, reports, audit logs             |
| `approve` | Approve a request               | attendance, leaves, expenses, payroll, purchases  |
| `reject`  | Reject a request                | attendance, leaves, expenses, payroll, purchases  |
| `manage`  | Administer                      | `settings:manage`, `users:manage`, `roles:manage` |

Business modules: customers, leads, invoices, payments, expenses, employees, attendance, leaves, payroll,
projects, tasks, products, suppliers, purchases, inventory, accounting. Plus `dashboard:view`, `reports:*`,
`audit-logs:*`, `users:*`, `roles:*`, `settings:*`.

## Built-in roles

Created for every company (`is_system = true`) and **read-only** — duplicate one to customize it.
Refreshed from code by `npm run db:seed`.

| Role              | Access                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Super Admin       | Everything (108 permissions). The company always keeps at least one active Super Admin                                                           |
| Admin             | Everything except `roles:manage` and `settings:manage` — runs users and all modules                                                              |
| Manager           | Dashboard, customers & leads, invoices (no delete), projects & tasks, approves attendance/leave/expenses/purchases, reports, views users         |
| Accountant        | Dashboard, invoices, payments, expenses, accounting; views customers, suppliers, purchases, payroll; reports                                     |
| HR Manager        | Dashboard, employees, **salary & bank details**, attendance, leaves, payroll (incl. approve/reject); reports; views users                        |
| Inventory Manager | Dashboard, products, inventory (stock operations, warehouses), suppliers, purchase requests/orders (create, edit, cancel — not approve), reports |
| Employee          | Dashboard; views & creates own attendance, leave and expense requests; views projects; views & edits tasks                                       |
| Customer          | No internal permissions — lands on their profile. The customer portal arrives in phase 15                                                        |

"Only their own records" (e.g. an Employee sees only their leave requests) is a record-level rule that each
module adds in its phase; permissions decide which _actions_ a role can perform.

## Where permissions are enforced

| Layer          | How                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Proxy          | `src/proxy.ts` — signed-out visitors of any non-public page go to `/login?next=…` (cookie check only) |
| Layout         | `(dashboard)/layout.tsx` — validates the session in the database; no company access → friendly screen |
| Pages          | `authorizePage("users:view")` at the top of every page → `<AccessDenied />` if missing                |
| Server actions | `requirePermission("users:manage")` first line of every action                                        |
| API routes     | `requirePermission("customers:view")` inside `handle()` → 401 / 403 JSON                              |
| Services       | `authorize(ctx, "users:manage")` again inside sensitive services (defense in depth)                   |
| Menu           | `allowedNavHrefs(permissions)` hides links — **convenience only**                                     |

### Helpers (`src/lib/tenant`, `src/lib/auth/page.ts`)

```ts
const ctx = await requirePermission("invoices:create"); // actions & API routes: throws 401/403
const ctx = await authorizePage("invoices:view");        // pages: redirects to /login or returns null
if (!ctx) return <AccessDenied />;
can(ctx, "invoices:approve");                           // boolean, e.g. to show a button
authorize(ctx, "invoices:approve");                     // throws ForbiddenError
assertCanGrant(ctx, role.permissions);                  // privilege-escalation guard
```

## Rules for user and role management

- **No privilege escalation:** you can only grant (to a role) or assign (via a role) permissions you hold
  yourself. An Admin therefore can't create or manage Super Admins, and a role editor can't add
  `settings:manage` unless they have it. The role editor greys out permissions you don't hold.
- **Not yourself:** you can't change, suspend or remove your own membership.
- **Last Super Admin:** the company's last active Super Admin can't be demoted, suspended or removed.
- **Built-in roles** can't be edited or deleted; custom roles can't be deleted while assigned.
- Every change is written to the audit log (`user.invite`, `user.role_change`, `user.suspend`, `user.reactivate`,
  `user.remove`, `role.create`, `role.update`, `role.delete`, `auth.*`).

## Company settings

`/settings` needs `settings:view` (Super Admin, Admin); changing the company profile, logo or preferences needs
`settings:manage` (Super Admin only by default). Admins see the page read-only.

## CRM

| Action                                                 | Permission                              | Built-in roles with it                  |
| ------------------------------------------------------ | --------------------------------------- | --------------------------------------- |
| See customers, their communication, documents, history | `customers:view`                        | Super Admin, Admin, Manager, Accountant |
| Add a customer                                         | `customers:create`                      | Super Admin, Admin, Manager             |
| Edit, log communication, upload/delete documents       | `customers:edit`                        | Super Admin, Admin, Manager             |
| Delete a customer                                      | `customers:delete`                      | Super Admin, Admin, Manager             |
| See leads and the pipeline                             | `leads:view`                            | Super Admin, Admin, Manager             |
| Add / edit / move / delete leads                       | `leads:create` / `edit` / `delete`      | Super Admin, Admin, Manager             |
| Convert a lead to a customer                           | `leads:edit` **and** `customers:create` | Super Admin, Admin, Manager             |

Every check runs in the service (`authorize`) as well as in the page/action/route; hidden buttons are a
convenience only.

## Sales

| Action                                                 | Permission                                  | Built-in roles (besides Super Admin / Admin)   |
| ------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------- |
| See quotations and sales orders, download / print      | `quotations:view`                           | Manager, Accountant                            |
| Create / duplicate quotations                          | `quotations:create`                         | Manager                                        |
| Edit, send, share, confirm, decline, cancel            | `quotations:edit`                           | Manager                                        |
| Delete (draft, declined or cancelled only)             | `quotations:delete`                         | Manager                                        |
| Convert a quotation to an invoice                      | `quotations:edit` **and** `invoices:create` | Manager                                        |
| See invoices; create; edit drafts, send, share, cancel | `invoices:view` / `create` / `edit`         | Accountant (all), Manager (view, create, edit) |
| Delete a draft invoice                                 | `invoices:delete`                           | Accountant                                     |
| See / record / void payments                           | `payments:view` / `create` / `delete`       | Accountant                                     |

`quotations:*` is new in phase 07 — run `npm run db:seed` after deploying so existing companies' built-in roles get
it. Share links (`/api/share/<token>`) are the only public sales URL: the token grants read access to one PDF.

## Finance

| Action                                                         | Permission                                               | Built-in roles (besides Super Admin / Admin) |
| -------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------- |
| See expenses (own only, see below) and submit your own         | `expenses:view` + `expenses:create`                      | Employee, Accountant                         |
| See everyone's expenses                                        | `expenses:approve`, `expenses:edit` or `accounting:view` | Manager, Accountant                          |
| Edit / delete anyone's pending or rejected expense             | `expenses:edit` / `expenses:delete`                      | Accountant                                   |
| Approve (posts to the ledger) / reject (reason required)       | `expenses:approve` / `expenses:reject`                   | Manager, Accountant                          |
| Mark an unpaid expense as paid (posts to the ledger)           | `accounting:create`                                      | Accountant                                   |
| See accounts, transactions, account ledgers, financial reports | `accounting:view`                                        | Accountant                                   |
| Add accounts / post manual transactions                        | `accounting:create`                                      | Accountant                                   |
| Edit accounts                                                  | `accounting:edit`                                        | Accountant                                   |
| Delete unused accounts / reverse manual transactions           | `accounting:delete`                                      | Accountant                                   |

**Own expenses:** a user without `expenses:approve`, `expenses:edit` or `accounting:view` sees only expenses filed
for or by themselves (lists, detail pages and the API — another person's expense is "not found"), can only file
for themselves, and may edit or delete their own expense while it is pending or rejected (with
`expenses:create`). Approved expenses can't be changed by anyone. The expense page's "Accounting" section is shown
only with `accounting:view`.

## HR

| Action                                                                         | Permission                              | Built-in roles (besides Super Admin / Admin) |
| ------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------- |
| See employees, departments, documents, everyone's attendance and leave         | `employees:view`                        | Manager, HR Manager                          |
| Add / edit (incl. status, photo, documents) / delete employees and departments | `employees:create` / `edit` / `delete`  | HR Manager                                   |
| See salary and masked bank details; reveal full numbers (audited)              | `salaries:view`                         | HR Manager                                   |
| Change salary and bank details                                                 | `salaries:edit`                         | HR Manager                                   |
| Check in / out for yourself                                                    | `attendance:create`                     | Employee, HR Manager                         |
| See your own attendance                                                        | `attendance:view`                       | Employee, Manager, HR Manager                |
| Enter or correct anyone's attendance / delete records                          | `attendance:edit` / `attendance:delete` | HR Manager                                   |
| Request leave for yourself / for anyone                                        | `leaves:create` / `leaves:edit`         | Employee, HR Manager / HR Manager            |
| Approve / reject leave (never your own request)                                | `leaves:approve` / `leaves:reject`      | Manager, HR Manager                          |
| Cancel anyone's pending leave request                                          | `leaves:delete`                         | HR Manager                                   |

**Record-level rules:** people without `employees:view` (or, for attendance, `attendance:edit` /
`attendance:approve`; for leave, `leaves:approve` / `leaves:edit`) see only their **own** attendance and leave —
another person's record is "not found", in pages and the API. Self-service needs the login to be linked to an
employee record. Salary and bank details are never part of employee responses; see `docs/hr.md`.
`salaries:*` is new in phase 09 — run `npm run db:seed` after deploying.

## Payroll

| Action                                                                       | Permission                           | Built-in roles (besides Super Admin / Admin) |
| ---------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| See payroll runs, payslips, salary slips, advances, reports, payroll history | `payroll:view`                       | HR Manager, Accountant                       |
| Process a month, record advances                                             | `payroll:create`                     | HR Manager                                   |
| Adjust draft payslips, recalculate, submit for approval                      | `payroll:edit`                       | HR Manager                                   |
| Approve a submitted run (**never the person who processed it**)              | `payroll:approve`                    | HR Manager                                   |
| Send a submitted run back to draft                                           | `payroll:reject`                     | HR Manager                                   |
| Mark an approved run as paid (posts to the ledger)                           | `payroll:view` + `accounting:create` | Accountant                                   |
| Cancel an unpaid run, cancel an outstanding advance                          | `payroll:delete`                     | HR Manager                                   |
| See / change salary structures (basic salary and recurring lines)            | `salaries:view` / `salaries:edit`    | HR Manager                                   |

Payroll data is salary data: Managers and Employees have no payroll permission and get "no access" / 403. Audit
entries for payroll name the action, employee and changed fields but never amounts. See `docs/payroll.md`.

## Projects and tasks

| Action                                                                   | Permission                            | Built-in roles (besides Super Admin / Admin) |
| ------------------------------------------------------------------------ | ------------------------------------- | -------------------------------------------- |
| See projects, progress and project reports                               | `projects:view`                       | Manager, Employee (own work only)            |
| Create / edit / delete projects (delete only without tasks)              | `projects:create` / `edit` / `delete` | Manager                                      |
| See tasks, the board and attachments                                     | `tasks:view`                          | Manager, Employee (own work only)            |
| Create tasks                                                             | `tasks:create`                        | Manager                                      |
| Edit and assign tasks (task managers: `tasks:create` or `projects:edit`) | `tasks:edit`                          | Manager                                      |
| Move the status of visible tasks, add attachments                        | `tasks:edit`                          | Manager, Employee (own tasks)                |
| Delete tasks                                                             | `tasks:delete`                        | Manager                                      |

**Record-level rules:** people who can't manage projects/tasks see only projects they manage or have tasks in and
tasks assigned to them or in projects they manage (through their linked employee record); anything else is "not
found". See `docs/projects.md`.

## Inventory and purchasing

| Action                                                   | Permission                                      | Built-in roles (besides Super Admin / Admin) |
| -------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| See products, stock, low stock, categories, valuation    | `products:view`                                 | Inventory Manager, Manager                   |
| Create / edit / delete products and categories           | `products:create` / `edit` / `delete`           | Inventory Manager                            |
| See stock movements and warehouses                       | `inventory:view`                                | Inventory Manager, Manager                   |
| Stock in / out / transfer, receive goods, add warehouses | `inventory:create`                              | Inventory Manager                            |
| Stock adjustment, edit warehouses                        | `inventory:edit`                                | Inventory Manager                            |
| Suppliers                                                | `suppliers:view` / `create` / `edit` / `delete` | Inventory Manager (all), Accountant (view)   |
| See purchase requests, orders, bills, payments           | `purchases:view`                                | Inventory Manager, Manager, Accountant       |
| Raise purchase requests, create purchase orders          | `purchases:create`                              | Inventory Manager                            |
| Edit / place draft orders                                | `purchases:edit`                                | Inventory Manager                            |
| Approve / reject purchase requests (**never your own**)  | `purchases:approve` / `purchases:reject`        | Manager                                      |
| Cancel orders and others' requests                       | `purchases:delete`                              | Inventory Manager                            |
| Record supplier invoices and payments                    | `accounting:create` (+ `purchases:view`)        | Accountant                                   |
| Cancel unpaid bills, void supplier payments              | `accounting:edit`                               | Accountant                                   |

A requester without `purchases:view` sees only their own purchase requests. See `docs/inventory.md`.

## Dashboard widgets

The dashboard needs `dashboard:view`; each widget additionally needs any one of its permissions in
`src/config/dashboard.ts`, checked in `dashboardService` (hidden widgets are never queried). Examples with the
built-in roles:

| Role        | Sees                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| Super Admin | Everything                                                                               |
| Accountant  | Revenue, expenses, net profit, outstanding invoices, customers, finance and sales charts |
| HR Manager  | Employees, attendance                                                                    |
| Manager     | Revenue, outstanding invoices, customers, expenses (approver), projects, tasks           |
| Employee    | Active projects, pending tasks, project status, "Add expense" (no company-wide money)    |

Quick actions need the module's `create` permission (e.g. `invoices:create` for "Create invoice").

## Adding a permission

1. Add the key to `PERMISSION_KEYS` in `src/lib/permissions/index.ts` (and its module label if new).
2. Add it to the built-in roles in `DEFAULT_ROLES` where appropriate.
3. Protect the page/action/route with it.
4. Run `npm run db:seed` (and deploy) — the catalogue and every company's built-in roles are refreshed.

## Tests proving it

- `tests/integration/rbac.test.ts` — role permissions from the database, forbidden actions per role, privilege
  escalation, last Super Admin, built-in roles, cross-company isolation (real PostgreSQL).
- `tests/integration/auth.test.ts` — sign-in, lockout, registration, verification, reset, change password, invitations.
- `tests/e2e/auth.spec.ts` — in a real browser: signed-out visitors are redirected from every protected page;
  an Employee is refused on pages and APIs outside the role even by typing the URL; the Super Admin manages users
  and roles.
- `tests/unit/permissions.test.ts`, `auth-routes.test.ts`, `session-policy.test.ts`, `auth-validation.test.ts`.
