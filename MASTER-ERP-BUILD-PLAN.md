# Master ERP Build Plan

Work one phase at a time, in order. For each phase:

1. Inspect the current code (see `AGENTS.md`).
2. Implement only that phase's scope.
3. Run the checks: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`.
4. Commit with the phase's exact commit message below.
5. Update this file's status, then **stop and wait for approval** before starting the next phase.

Status legend: ✅ done · 🟡 partially done / scaffolded · ⬜ not started

| #   | Commit message                                                    | Status |
| --- | ----------------------------------------------------------------- | ------ |
| 00  | `chore(phase-00): initialize ERP project foundation`              | ✅     |
| 01  | `feat(phase-01): establish ERP UI and UX design system`           | ✅     |
| 02  | `feat(phase-02): establish database and backend foundation`       | ✅     |
| 03  | `feat(phase-03): implement authentication and RBAC`               | ✅     |
| 04  | `feat(phase-04): implement multi-tenant company isolation`        | ✅     |
| 05  | `feat(phase-05): implement ERP dashboard`                         | ✅     |
| 06  | `feat(phase-06): implement CRM customers and leads`               | ✅     |
| 07  | `feat(phase-07): implement sales`                                 | ⬜     |
| 08  | `feat(phase-08): implement finance and accounting`                | ⬜     |
| 09  | `feat(phase-09): implement HR`                                    | ⬜     |
| 10  | `feat(phase-10): implement payroll`                               | ⬜     |
| 11  | `feat(phase-11): implement projects and tasks`                    | ⬜     |
| 12  | `feat(phase-12): implement inventory and purchasing`              | ⬜     |
| 13  | `feat(phase-13): implement notifications and audit logs`          | 🟡     |
| 14  | `feat(phase-14): implement reports and exports`                   | ⬜     |
| 15  | `feat(phase-15): implement customer portal and advanced features` | ⬜     |
| 16  | `feat(phase-16): production hardening and Vercel deployment`      | ⬜     |

## Pre-work (already committed, before phase numbering)

- ✅ Project structure, TypeScript, ESLint, Vitest, CI
- ✅ Prisma schema for all modules
- ✅ Agent rules (`AGENTS.md`)
- ✅ Customers API (reference module) and auth/RBAC/tenant libraries — kept, not extended, in phase 00

## Phase 00 — Project foundation

- ✅ Next.js 16, React 19, TypeScript 6 (strict), Turbopack
- ✅ Tailwind CSS 4 + shadcn/ui (Radix, Nova) + Lucide icons
- ✅ React Hook Form + Zod (login form as the reference)
- ✅ Prisma 7 with PostgreSQL driver adapter, initial migration, idempotent seed
- ✅ Validated environment variables (`src/lib/env`), fail-fast at build and startup
- ✅ ESLint 9 + Prettier; agent rules enforced by lint where possible
- ✅ Vitest (unit + component) and Playwright (e2e) foundation
- ✅ CI: Postgres service, migrations, lint, typecheck, test, build, e2e
- ✅ Docs: README, architecture, database, deployment, decisions

## Phase 01 — ERP UI and UX design system

- ✅ Visual language: enterprise palette, status colors, typography, spacing, radius, shadows, dark mode
- ✅ Accessible contrast enforced by a unit test (WCAG AA, both themes)
- ✅ App shell: sidebar, header (company, global search, notifications, user menu), breadcrumbs
- ✅ Responsive mobile navigation (slide-out menu), verified at 390px, 834px and 1440px
- ✅ Components: PageHeader, KpiCard, DataTable, Pagination, SearchInput, FilterBar, Modal, ConfirmDialog,
  StatusBadge, FormField, DatePicker, SelectInput, Tabs, dropdown menus, toasts, skeletons, states
- ✅ Placeholder navigation for all modules, filtered by role; honest "not available yet" pages
- ✅ Dev-only component reference at `/design-system`; docs in `docs/design-system.md`

## Phase 02 — Database and backend foundation

- ✅ Core schema: companies, users, sessions, permissions, roles, role_permissions, memberships, settings, audit_logs
  (+ customers and notifications, which the app already uses)
- ✅ Conventions: snake_case tables, UUID v7, timestamptz, `company_id` on every tenant table, composite FKs,
  created/updated at/by
- ✅ Fresh baseline migration; drift check (`npm run db:check`) in CI
- ✅ Seed workflow via real services: permission catalogue, first company, built-in roles, Owner (idempotent)
- ✅ Error handling (`AppError`, `handle()`, `runAction()`), structured redacting logger, request ids
- ✅ Repository/service conventions (`helpers.ts`), settings registry + service, audit service
- ✅ Sign-in, failed sign-in and sign-out are audited
- ✅ Integration tests against real PostgreSQL (bootstrap, tenant isolation, constraints, settings)

## Phase 03 — Authentication and RBAC

- ✅ Login, logout, registration (optional), forgot/reset password, email verification, change password
- ✅ Invitations with single-use links; profile page; signed-in devices with remote sign-out
- ✅ Sessions: idle + absolute expiry, new token per sign-in, lockout after 5 failures, audited account events
- ✅ Email delivery (SMTP / console / memory transports) with templates
- ✅ Roles: Super Admin, Admin, Manager, Accountant, HR Manager, Employee, Customer
- ✅ Permissions: view, create, edit, delete, export, approve, reject, manage settings/users/roles (101 keys)
- ✅ Protection in layers: proxy, layout, `authorizePage`, `requirePermission`, service `authorize`
- ✅ User management UI (invite, change role, suspend/reactivate, remove, resend) and role management UI
  (permission matrix, custom roles, duplicate, delete) with privilege-escalation guard
- ✅ Tests: integration (auth + RBAC), e2e (protected pages, forbidden actions, role permissions)

## Phase 04 — Multi-tenant company isolation

- ✅ Company context: tenant resolver (session-stored active company, validated per request), company switcher
- ✅ Tenant-aware database access: tenant guard rejects unscoped queries on company-owned tables; `crossTenant()` for
  reviewed exceptions (repositories only, enforced by ESLint)
- ✅ Tenant-aware authorization: permissions of the role in the _current_ company; company never taken from input
- ✅ Company profile and preferences (Settings page; read-only without `settings:manage`)
- ✅ Logo upload architecture: storage drivers (local, S3-compatible), per-company keys, byte-level image checks
- ✅ Tests: Company A cannot read / update / delete Company B data (services, repositories, API via browser),
  tenant guard, company switching, logo isolation

## Phase 05 — Dashboard

- ✅ Widget registry (`src/config/dashboard.ts`): 9 KPIs, 6 charts, 6 activity sources, 7 quick actions, each with
  the permissions that grant it — filtered on the server
- ✅ Real data where the module exists (customers: total, new in range, growth chart, recent activity); every other
  widget reports "not tracked yet" with its module and phase — no invented figures
- ✅ Date filter (month-based presets incl. fiscal year, in the company's time zone), kept in the URL
- ✅ Responsive charts (Recharts via shadcn chart) with screen-reader tables; loading skeletons per section,
  empty states, per-widget error states with retry
- ⬜ Later phases add a provider per widget as their module ships (Sales 07, Finance 08, HR 09, Projects 11,
  Inventory 12) and set the quick-action `href` once the create screen exists

## Phase 06 — CRM

- ✅ Customers: all PRD fields (Customer ID, company, WhatsApp, city, country, tax number, type, status, notes),
  list with search, filters, sort and pagination, detail page, form, delete with confirmation
- ✅ Customer communication log and notes, documents (upload/download/delete), history from the audit log
- ✅ Invoices / payments / projects tabs say "not tracked yet" until phases 07 and 11
- ✅ Leads: all PRD fields, list with filters, kanban pipeline (drag and drop + keyboard menu), detail, form,
  convert lead → customer
- ✅ Per-company numbering, validation, audit logging, permission checks, tenant isolation; tests for CRUD,
  permissions and isolation (integration + browser)

## Phase 07 — Sales

- ⬜ Invoices with line items, tax, numbering, statuses
- ⬜ Payments against invoices, invoice PDF and email

## Phase 08 — Finance and accounting

- ⬜ Chart of accounts, journal entries (balanced debits/credits)
- ⬜ Automatic posting from invoices, payments, expenses
- ⬜ Expenses with receipt upload
- ⬜ Trial balance, P&L, balance sheet

## Phase 09 — HR

- ⬜ Employees, attendance check-in/out, leave requests with approval

## Phase 10 — Payroll

- ⬜ Payroll runs → payslips → salary journal entries, payslip PDF

## Phase 11 — Projects and tasks

- ⬜ Projects, tasks (kanban), assignees, due dates

## Phase 12 — Inventory and purchasing

- ⬜ Products/services, stock movements, reorder alerts
- ⬜ Suppliers, purchase orders → stock-in

## Phase 13 — Notifications and audit logs

- ✅ `writeAuditLog` helper, used by customers
- ⬜ In-app notifications (bell, mark read), email notifications
- ⬜ Audit log viewer with filters

## Phase 14 — Reports and exports

- ⬜ Sales, AR aging, payroll, stock valuation reports
- ⬜ CSV / Excel / PDF exports

## Phase 15 — Customer portal and advanced features

- ⬜ Customer portal: view/pay invoices, project status
- ⬜ Advanced features to be scoped before the phase starts

## Phase 16 — Production hardening and Vercel deployment

- ⬜ E2E tests (Playwright), security review, Postgres row-level security
- ⬜ Vercel project, managed Postgres, migrations on deploy, monitoring
