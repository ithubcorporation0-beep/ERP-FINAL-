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
| 02  | `feat(phase-02): establish application foundation`                | 🟡     |
| 03  | `feat(phase-03): implement authentication and RBAC`               | 🟡     |
| 04  | `feat(phase-04): implement multi-tenant company foundation`       | 🟡     |
| 05  | `feat(phase-05): implement dashboard`                             | ⬜     |
| 06  | `feat(phase-06): implement CRM`                                   | 🟡     |
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

## Phase 02 — Application foundation

- ✅ Prisma client, Zod validation, route handler error mapping (`lib/api.ts`)
- ✅ Repository → service → route layering (customers as reference)
- ✅ Initial migration (done in phase 00)
- ✅ Environment variable validation at startup (done in phase 00)
- ⬜ Integration test setup against a test database

## Phase 03 — Authentication and RBAC

- ✅ Database sessions, bcrypt passwords, login/logout (`auth.service`)
- ✅ Permission model with wildcards, `requirePermission`, default roles
- ⬜ Route protection middleware, password reset, session revocation UI
- ⬜ Login rate limiting
- ⬜ Audit login/logout (decide schema: nullable `organizationId` or separate auth log)

## Phase 04 — Multi-tenant company foundation

- ✅ `organizationId` on all business data, `requireTenant`
- ⬜ Company switcher, company settings (currency, timezone)
- ⬜ Invite users, assign roles, manage memberships
- ⬜ Tenant-isolation tests

## Phase 05 — Dashboard

- ⬜ KPI tiles and charts from real data (revenue, receivables, cash, headcount, open tasks)

## Phase 06 — CRM

- ✅ Customers API (audit, soft delete)
- ⬜ Customers UI (list, create, edit, delete with confirmation)
- ⬜ Leads pipeline (API + kanban UI, convert lead → customer)

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
