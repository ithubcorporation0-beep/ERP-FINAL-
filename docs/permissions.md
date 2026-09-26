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
- The seed syncs the list into the `permissions` table (currently **101** keys), deleting retired keys.
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

| Role        | Access                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Super Admin | Everything (101 permissions). The company always keeps at least one active Super Admin                                                   |
| Admin       | Everything except `roles:manage` and `settings:manage` — runs users and all modules                                                      |
| Manager     | Dashboard, customers & leads, invoices (no delete), projects & tasks, approves attendance/leave/expenses/purchases, reports, views users |
| Accountant  | Dashboard, invoices, payments, expenses, accounting; views customers, suppliers, purchases, payroll; reports                             |
| HR Manager  | Dashboard, employees, attendance, leaves, payroll (incl. approve/reject); reports; views users                                           |
| Employee    | Dashboard; views & creates own attendance, leave and expense requests; views projects; views & edits tasks                               |
| Customer    | No internal permissions — lands on their profile. The customer portal arrives in phase 15                                                |

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
