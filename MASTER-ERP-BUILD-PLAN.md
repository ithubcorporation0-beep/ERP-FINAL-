# Master ERP Build Plan

Status legend: ✅ done · 🟡 scaffolded · ⬜ not started

## Phase 0 — Foundation
- ✅ Project structure, TypeScript, ESLint, Vitest, CI
- ✅ Prisma schema for all modules
- ✅ Multi-tenant context (`requireTenant`) and RBAC (`requirePermission`)
- ✅ Database sessions, login/logout
- ✅ Audit logging helper
- ✅ Seed: organization, default roles, chart of accounts, admin
- ⬜ Initial migration (`npm run db:migrate -- --name init` against a real database)
- ⬜ UI kit (shadcn/ui + Tailwind) in `src/components/ui`

## Phase 1 — CRM
- ✅ Customers API (reference module: repository → service → route, audit, soft delete)
- ⬜ Customers UI (table, form)
- 🟡 Leads pipeline (API stub)

## Phase 2 — Sales & Finance
- 🟡 Invoices with line items, tax, numbering, PDF (`lib/pdf`), email (`lib/email`)
- 🟡 Payments → invoice status + journal entries
- 🟡 Expenses with receipt upload (`lib/storage`)
- 🟡 Accounting: journal, trial balance, P&L, balance sheet

## Phase 3 — HR
- 🟡 Employees, attendance check-in/out
- 🟡 Leave requests with approval flow
- 🟡 Payroll runs → payslips → salary journal entries

## Phase 4 — Projects
- 🟡 Projects, tasks (kanban), assignees

## Phase 5 — Inventory & Purchasing
- 🟡 Products & services, stock movements, reorder alerts
- 🟡 Suppliers, purchase orders → stock-in

## Phase 6 — Platform
- 🟡 Dashboard KPIs and charts
- 🟡 Reports (sales, AR aging, payroll, stock valuation)
- 🟡 Notifications
- 🟡 Audit log viewer
- 🟡 Settings: organization, users, roles

## Phase 7 — Hardening
- ⬜ Integration tests against a test database
- ⬜ E2E tests (Playwright)
- ⬜ Rate limiting on auth, CSRF review, Postgres row-level security
