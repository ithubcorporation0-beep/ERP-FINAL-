# Database

PostgreSQL (15+, developed on 16) through **Prisma 7**. Schema: `prisma/schema.prisma`.
Prisma settings (connection URL, migrations folder, seed command): `prisma.config.ts`.

## What exists today (phases 02–13)

The **core platform** tables. ERP module tables (invoices, employees, stock, …) are added by the
phase that builds each module, so every table is designed with its real requirements.

```
companies ──┬── memberships ── users ──┬── sessions
            │                          └── auth_tokens (email links)
            ├── roles ── role_permissions ── permissions (global catalogue)
            ├── settings
            ├── audit_logs (append-only; company optional)
            ├── customers ──┬── customer_documents (files in storage)
            │               ├── customer_communications (log + notes)
            │               └── leads (converted leads point at their customer)
            ├── leads (pipeline; assigned_to → users)
            ├── number_sequences (per-company counters: CUS-0001, LEAD-0001, QUO/SO/INV/PAY …)
            ├── quotations ── quotation_items   (a confirmed quotation is a sales order)
            ├── invoices ── invoice_items, payments
            ├── share_links (public, expiring links to one document's PDF)
            ├── accounts (chart of accounts)
            ├── journal_entries ── journal_lines → accounts   (double-entry ledger)
            ├── expenses (employee → users, receipt in storage)
            ├── departments ── employees ──┬── employee_compensations (restricted; encrypted bank numbers)
            │                  (user → users) ├── employee_documents
            │                              ├── attendance_records (one per employee and day)
            │                              ├── leave_requests
            │                              ├── salary_components (restricted structure lines)
            │                              └── salary_advances
            ├── payroll_runs ── payroll_items (one per employee; net formula CHECK)
            └── notifications
```

| Table                            | Tenant-owned                               | Purpose                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `companies`                      | — (is the tenant)                          | A customer company: name, legal name, tax id, contact details, country, base currency, time zone, locale, fiscal year, status, logo (storage key + type)                       |
| `users`                          | no (global)                                | A person's login. Linked to companies through `memberships`                                                                                                                    |
| `sessions`                       | no                                         | Signed-in browser sessions (hashed tokens only; idle + absolute expiry; `active_company_id` = company chosen in the switcher)                                                  |
| `auth_tokens`                    | no (optional `company_id` for invitations) | Single-use email links: verification, password reset, invitation (hashed)                                                                                                      |
| `permissions`                    | no (global)                                | Catalogue of `module:action` keys, synced from code                                                                                                                            |
| `roles`                          | `company_id`                               | Named permission sets per company (Owner, Admin, … + custom later)                                                                                                             |
| `role_permissions`               | `company_id`                               | Which permissions a role has                                                                                                                                                   |
| `memberships`                    | `company_id`                               | A user's access to a company, with exactly one role there                                                                                                                      |
| `settings`                       | `company_id`                               | Validated per-company preferences (key → JSON value)                                                                                                                           |
| `audit_logs`                     | `company_id` (null for sign-in events)     | Immutable history of important actions: actor, action, entity, before/after, IP and user agent. **Append-only** (trigger)                                                      |
| `customers`                      | `company_id`                               | CRM customers (reference module): `number` (Customer ID), contact details, WhatsApp, city, country, tax number, type, status, notes; soft delete                               |
| `customer_documents`             | `company_id`                               | Files attached to a customer: cleaned name, storage key, detected content type, size                                                                                           |
| `customer_communications`        | `company_id`                               | Communication log and notes on a customer: channel, direction, subject, body, when                                                                                             |
| `leads`                          | `company_id`                               | Sales pipeline: `number` (Lead ID), contact, source, assignee (a member), stage, expected value (NUMERIC 18,2), follow-up date, converted customer                             |
| `quotations`, `quotation_items`  | `company_id`                               | Quotations / sales orders (`number`, `order_number`), customer, lead, dates, currency, exact totals; lines with quantity, unit price, discount %, tax %, amounts               |
| `invoices`, `invoice_items`      | `company_id`                               | Invoices (`code` as issued), customer, source quotation, dates, status, totals, `amount_paid` (kept equal to the sum of non-voided payments)                                   |
| `payments`                       | `company_id`                               | Money received against an invoice; voided (`voided_at`, reason, by) instead of deleted                                                                                         |
| `share_links`                    | `company_id`                               | Token hash, document type + id, expiry, revocation, last access                                                                                                                |
| `number_sequences`               | `company_id`                               | Per-company counters for human-readable numbers, incremented atomically (`INSERT … ON CONFLICT … RETURNING`)                                                                   |
| `accounts`                       | `company_id`                               | Chart of accounts: code, name, type (asset, liability, equity, revenue, expense), `system_key` for accounts used by automatic postings, active flag                            |
| `journal_entries`                | `company_id`                               | Transactions (`number` = JE-0001): type, date, description, reference, `posting_key` (unique, idempotent automatic postings), source, `reversal_of_id`                         |
| `journal_lines`                  | `company_id`                               | One debit **or** credit (NUMERIC 18,2) on one account; CHECK one side; deferred trigger checks Σ debit = Σ credit per entry                                                    |
| `expenses`                       | `company_id`                               | Expenses (`number` = EXP-0001): category, amount, date, vendor, payment method, description, employee, approval status/decision, paid date, receipt; soft delete               |
| `departments`                    | `company_id`                               | Departments: name (unique per company), description, active flag                                                                                                               |
| `employees`                      | `company_id`                               | Employees (`number` = EMP-0001): profile, CNIC/ID, department, position, joining date, status + exit date, photo key, emergency contact, optional `user_id` login; soft delete |
| `employee_compensations`         | `company_id`                               | Salary (NUMERIC 18,2), bank name, account title, **encrypted** account number and IBAN (+ last 4 for masking). Restricted: `salaries:*`                                        |
| `employee_documents`             | `company_id`                               | Files attached to an employee (same shape as `customer_documents`)                                                                                                             |
| `attendance_records`             | `company_id`                               | One row per employee and day: check-in/out instants, status, late / early / worked minutes, source (self / HR), note                                                           |
| `leave_requests`                 | `company_id`                               | Leave (`number` = LV-0001): employee, type, dates, working days, reason, attachment, status and decision; soft delete                                                          |
| `salary_components`              | `company_id`                               | Salary structure lines: allowance, deduction or tax; name, monthly amount, active flag. Restricted: `salaries:*`                                                               |
| `salary_advances`                | `company_id`                               | Advances (`number` = ADV-0001): employee, amount, date, method, reason, status (outstanding / recovered / cancelled), recovering run                                           |
| `payroll_runs`                   | `company_id`                               | Payroll per month (`number` = PRL-0001): period, pay date, status workflow, `active_period` (unique per company while not cancelled), approval and payment                     |
| `payroll_items`                  | `company_id`                               | Payslips: employee snapshot, basic, allowances, bonus, overtime, deductions, tax, advances, net (NUMERIC 18,2), line snapshot (JSON), note                                     |
| `projects`                       | `company_id`                               | Projects (`number` = PRJ-0001): name, customer, manager (employee), start/end date, budget (NUMERIC 18,2) + currency, status, description, completed at; soft delete           |
| `tasks`                          | `company_id`                               | Tasks (`number` = TSK-0001): project, name, assignee (employee), priority, status, start/due date, description, completed at; soft delete                                      |
| `task_attachments`               | `company_id`                               | Files attached to a task (same shape as `customer_documents`)                                                                                                                  |
| `product_categories`             | `company_id`                               | Product categories (name unique per company)                                                                                                                                   |
| `warehouses`                     | `company_id`                               | Stock locations: name (unique per company), address, active flag                                                                                                               |
| `products`                       | `company_id`                               | Products (`number` = PRD-0001): SKU (unique), name, category, brand, unit, purchase/selling price, minimum stock, supplier, default warehouse, active. **No stock column**     |
| `stock_movements`                | `company_id`                               | Inventory ledger (`number` = STK-0001): product, warehouse, type, signed quantity (NUMERIC 18,3), unit cost, date, reference, transfer id, goods receipt. **Append-only**      |
| `suppliers`                      | `company_id`                               | Suppliers (`number` = SUP-0001): name, company, phone, email, address, tax number, notes, active; soft delete                                                                  |
| `purchase_requests` (+ `_items`) | `company_id`                               | Requests (`number` = PR-0001): requester, suggested supplier, needed by, reason, status and decision; lines with product, quantity, estimated price                            |
| `purchase_orders` (+ `_items`)   | `company_id`                               | Orders (`number` = PO-0001): supplier, request (unique), receiving warehouse, dates, status, total; lines with quantity, unit price, line total                                |
| `goods_receipts` (+ `_items`)    | `company_id`                               | Goods received (`number` = GRN-0001) against an order: date, warehouse, note; lines per order line and product                                                                 |
| `supplier_invoices`              | `company_id`                               | Bills (`number` = BILL-0001): supplier, order, supplier's number, dates, subtotal, tax, total, amount paid, status                                                             |
| `supplier_payments`              | `company_id`                               | Payments to suppliers (`number` = SPAY-0001) against a bill: amount, method, date, reference; voided with a reason, never deleted                                              |
| `notifications`                  | `company_id`                               | In-app notifications (header bell, `/notifications`): user, type, title, body, link, entity, read at, dedupe key (unique per user)                                             |
| `notification_preferences`       | `company_id`                               | Per user and type: in-app and email on/off (missing row = the type's defaults)                                                                                                 |
| `email_outbox`                   | `company_id`                               | Queued notification emails: recipient, subject, body, link, status (pending/sent/failed), attempts, next attempt, last error                                                   |

## Conventions

| Rule                  | Detail                                                                                                                                                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Naming                | Tables/columns are `snake_case` in SQL (`company_id`); models/fields are `PascalCase`/`camelCase` in TypeScript (`companyId`) via `@@map`/`@map`.                                                                                                                                         |
| IDs                   | UUID v7 (`uuid(7)`, time-ordered → index-friendly), native `uuid` type. Validate ids with `idSchema` before querying.                                                                                                                                                                     |
| Timestamps            | `timestamptz(3)` — stored in UTC, time-zone aware. Show in the company's `timezone`.                                                                                                                                                                                                      |
| Audit columns         | Editable tables have `created_at`, `updated_at`, `created_by`, `updated_by` (FK → users, `SET NULL`). Set them with `createdBy(actorId)` / `updatedBy(actorId)`. Append-only tables (`audit_logs`) and join rows only have `created_*`.                                                   |
| Tenancy               | Every table holding company data has `company_id`, **including child/join tables**. Children use a **composite foreign key** `(parent_id, company_id) → parent(id, company_id)`, so the database itself refuses cross-company links (see `memberships.role` and `role_permissions.role`). |
| Deleting              | Master data is soft-deleted (`deleted_at`). Companies are archived (`status`), never hard-deleted once they have audit history (`audit_logs` → `ON DELETE RESTRICT`). Business records use `RESTRICT` towards the company for the same reason.                                            |
| Money (from phase 07) | `Decimal(14,2)` — never floating point. Quantities `Decimal(14,3)`. Currency = company `base_currency` unless a column says otherwise.                                                                                                                                                    |
| Settings              | Never read raw `settings` rows: keys, types and defaults live in `src/lib/settings/registry.ts`; use `settingsService`. Only non-default values are stored.                                                                                                                               |

## Tenancy enforcement

Company data is protected at several levels (overview in `docs/architecture.md` → Multi-tenancy):

1. **Schema:** `company_id` on every company-owned table (`roles`, `role_permissions`, `memberships`, `settings`,
   `customers`, `customer_documents`, `customer_communications`, `leads`, `number_sequences`, `quotations`,
   `quotation_items`, `invoices`, `invoice_items`, `payments`, `share_links`, `notifications`, `notification_preferences`, `email_outbox`, `audit_logs`, and every module table added since), with composite foreign keys for children (a document, note or converted lead can only point at a
   customer of the same company — the database refuses anything else).
2. **Repositories:** every function takes `companyId` first and filters by it, including `updateMany` / `deleteMany`
   (a guessed id of another company updates or deletes **0 rows**).
3. **Tenant guard** (`src/lib/db/tenant-guard.ts`): a Prisma client extension on the shared `db` client that throws
   `TenantScopeError` for any query on those tables whose `where` (or insert data) has no `companyId` — including
   inside transactions. It checks top-level `companyId` and compound unique keys such as `companyId_name`.
   Intentional cross-company queries are wrapped in `crossTenant("reason", () => …)`, in repositories only: a user's
   _own_ memberships (default company, company switcher list, activating invitations), the public share-link lookup,
   and the email dispatcher (`emailOutboxRepository`), which delivers queued emails of every company.

Not covered by the guard (review these by hand): raw SQL (`$queryRaw`, `$executeRaw`) and nested relation queries
(they are reached through an already-scoped parent). Raw SQL is used only where Prisma can't express the query
(today: `customerRepository.countCreatedByMonth`, grouping by month in the company's time zone, and
`numberSequenceRepository.next`, an atomic upsert-and-increment; `invoiceRepository.lock` (`SELECT … FOR UPDATE`) and
`sumIssuedByMonth`; `journalRepository.monthlyByType`, ledger totals per month; `employeeRepository.lock`, `SELECT … FOR UPDATE`
before the leave overlap check; `payrollRepository.lockRun` before every change to a payroll run; `productRepository.lock`,
`purchaseOrderRepository.lock` and `supplierInvoiceRepository.lock` before stock-reducing movements, goods receipts
and supplier payments; `emailOutboxRepository.claimDue`, `SELECT id … FOR UPDATE SKIP LOCKED` across companies for
the dispatcher — it reads only ids and status, then loads the rows through `crossTenant`); it always filters
`company_id = ${companyId}` explicitly, uses tagged-template parameters (never string concatenation), validates the
rows with Zod, and has an isolation test. PostgreSQL row-level security can be added later as a sixth
layer (see ADR-024).

**New company-owned table checklist:** `company_id` column + index → composite FK for children → add the model to
`TENANT_MODELS` → repository functions with `companyId` first → isolation tests (read / update / delete).

## How the app talks to the database

```
route / server action ──► service ──► repository ──► Prisma client (src/lib/db) ──► PostgreSQL
```

- **Client:** `src/lib/db/index.ts` — one `PrismaClient` per server process using the `pg` driver
  adapter (`@prisma/adapter-pg`). Server-only; importing it from browser code is a build error.
- **Generated types:** `@/generated/prisma/client` (regenerated by `npm install` / `npm run db:generate`).
- **Environment:** `DATABASE_URL` is validated at startup and build (`src/lib/env/schema.ts`).
- **Repositories** are the only code that runs queries. See `docs/architecture.md` for the conventions.

## Workflows

### First-time local setup

```bash
# 1. A PostgreSQL server, e.g. Docker:
docker run -d --name erp-db -p 5432:5432 \
  -e POSTGRES_USER=erp -e POSTGRES_PASSWORD=erp -e POSTGRES_DB=it_hub_erp postgres:16
# 2. Settings
cp .env.example .env         # set DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
# 3. Tables + first company
npm run db:deploy            # apply all migrations
npm run db:seed              # permission catalogue + first company, roles and Owner
```

### Changing the schema (migration workflow)

1. Edit `prisma/schema.prisma` (follow the conventions above).
2. `npm run db:migrate -- --name short_description` — writes `prisma/migrations/<timestamp>_short_description/migration.sql`,
   applies it locally and regenerates the client.
3. **Read the generated SQL.** Renames show up as drop + add (data loss) — edit the SQL to `RENAME` instead
   _before committing_ if needed.
4. `npm run db:check` must print "No difference detected".
5. Commit the schema **and** the migration folder together.

Never edit a migration that has been applied anywhere shared (CI excluded) — add a new one.
In production and CI, only `npm run db:deploy` is used (it never generates or resets).

### Seed workflow

`npm run db:seed` loads **system data only — never fake business data**:

1. syncs the permission catalogue (`src/lib/permissions`) into `permissions`;
2. creates or updates the company named `SEED_COMPANY_NAME`, its built-in roles and the Owner
   account (`SEED_ADMIN_*`).

It uses the same `companyService.bootstrap()` the application uses, is idempotent (safe on every
deploy) and never changes an existing user's password.

### Testing against a real database

Integration tests (`tests/integration`) run against **PostgreSQL, not mocks**:

- Set `TEST_DATABASE_URL` to a separate database whose name contains `test` (the runner refuses any
  other name, because it empties the tables before each test).
- `npm run test` runs them together with unit tests; `npm run test:integration` runs only them.
- Migrations are applied automatically before the run.
- Tests call the real services (which use the guarded `db`). To _inspect_ the database directly — e.g. "company B's
  row is unchanged" — they use `rawDb` from `tests/integration/raw-db.ts`, an unguarded client that must never be
  imported from `src/`. Without `TEST_DATABASE_URL` they are skipped
  with a warning; CI always runs them.

## Commands

| Command                    | What it does                                                          |
| -------------------------- | --------------------------------------------------------------------- |
| `npm run db:generate`      | Regenerate the Prisma client (also runs on `npm install`)             |
| `npm run db:migrate`       | Create + apply a migration in development, then regenerate the client |
| `npm run db:deploy`        | Apply committed migrations (production, CI, fresh local setup)        |
| `npm run db:status`        | Show which migrations are applied                                     |
| `npm run db:check`         | Fail if the database and `schema.prisma` differ (drift check, in CI)  |
| `npm run db:seed`          | Sync permissions and bootstrap the first company (idempotent)         |
| `npm run db:studio`        | Browse the database in a web UI                                       |
| `npm run test:integration` | Run the real-database integration tests                               |

## Migrations

| Migration                                      | Contents                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260925184444_init`                          | Core platform schema (phase 02). Replaced the phase-00 draft before any deployment — see ADR-015.                                                                                                                                                                                                                        |
| `20260926172858_auth_and_rbac`                 | Phase 03: `auth_tokens`, user security columns (verification, lockout, profile), session absolute expiry. **Data migration:** permission verbs `read→view`, `update→edit`; role `Owner→Super Admin`; retired `Sales Rep` kept as a custom role; existing users marked verified. Run `npm run db:seed` afterwards.        |
| `20260926181244_company_context_and_logo`      | Phase 04: `sessions.active_company_id` (company switcher, `SET NULL` if the company is deleted); `companies.logo_key`, `logo_content_type`, `logo_updated_at`.                                                                                                                                                           |
| `20260927120000_crm_customers_and_leads`       | Phase 06: CRM enums; new customer columns; `customer_documents`, `customer_communications`, `leads`, `number_sequences`. **Data migration:** existing customers are numbered 1, 2, 3… per company (oldest first) and each company's `customer` sequence continues after them.                                            |
| `20260927160000_sales_invoices_and_payments`   | Phase 07: quotations (+ items), invoices (+ items), payments, share links; `leads (id, company_id)` unique for composite keys.                                                                                                                                                                                           |
| `20260927160100_sales_money_checks`            | Phase 07: CHECK constraints — payment amount > 0, 0 ≤ amount paid ≤ total, totals ≥ 0, due/expiry ≥ document date, line quantity > 0, percentages 0–100.                                                                                                                                                                 |
| `20260928100000_expenses_and_accounting`       | Phase 08: accounting and expense enums; `accounts`, `journal_entries`, `journal_lines`, `expenses`.                                                                                                                                                                                                                      |
| `20260928100100_ledger_integrity`              | Phase 08: CHECK `journal_lines_one_side`, `expenses_amount_positive`; function `check_journal_entry_balanced()` and deferred constraint trigger `journal_lines_balanced`. Run `npm run db:seed` afterwards to create default accounts and post existing invoices/payments.                                               |
| `20260929100000_hr_employees_attendance_leave` | Phase 09: HR enums; `departments`, `employees`, `employee_compensations`, `employee_documents`, `attendance_records`, `leave_requests`. Run `npm run db:seed` afterwards so built-in roles get `salaries:*`.                                                                                                             |
| `20260929100100_hr_integrity`                  | Phase 09: CHECK constraints — exit date required for resigned/terminated and not before joining; salary ≥ 0; absent days have no times and present days a check-in; check-out ≥ check-in; minutes ≥ 0; leave end ≥ start and days > 0.                                                                                   |
| `20260930100000_payroll`                       | Phase 10: payroll enums; `salary_components`, `salary_advances`, `payroll_runs`, `payroll_items`.                                                                                                                                                                                                                        |
| `20260930100100_payroll_integrity`             | Phase 10: CHECKs — amounts ≥ 0; **net = basic + allowances + bonus + overtime − deductions − tax − advances**; month 1–12; `active_period` matches the month unless cancelled; paid ⇔ paid date; recovered advance ⇔ run. Trigger `payroll_items_frozen` blocks changes to payslips of approved, paid or cancelled runs. |
| `20261001100000_projects_and_tasks`            | Phase 11: project/task enums; `projects`, `tasks`, `task_attachments` (composite keys to customers, employees and projects).                                                                                                                                                                                             |
| `20261001100100_projects_integrity`            | Phase 11: CHECKs — project end ≥ start, budget ≥ 0, completed ⇔ `completed_at`; task due ≥ start, completed ⇔ `completed_at`.                                                                                                                                                                                            |
| `20261002100000_inventory_and_purchasing`      | Phase 12: stock movement and purchasing enums; `product_categories`, `warehouses`, `products`, `stock_movements`, `suppliers`, `purchase_requests` (+ items), `purchase_orders` (+ items), `goods_receipts` (+ items), `supplier_invoices`, `supplier_payments`.                                                         |
| `20261002100100_inventory_integrity`           | Phase 12: CHECKs — prices, minimum stock ≥ 0; movement quantity ≠ 0 and sign matches type; transfer/receipt links; order and bill amounts; **bill total = subtotal + tax**; paid within total; cancelled ⇔ date. Triggers `stock_movements_append_only` and `stock_movements_no_negative_stock`.                         |
| `20261003100000_notifications_and_audit`       | Phase 13: notification type, entity and dedupe key; `notification_preferences`; `email_outbox` (+ enums); audit log index on (company, action).                                                                                                                                                                          |
| `20261003100100_audit_log_immutable`           | Phase 13: trigger `audit_logs_append_only` refuses UPDATE and DELETE on `audit_logs` (except the FK clearing a deleted user); CHECKs on outbox attempts and sent time.                                                                                                                                                   |
