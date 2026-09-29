# Architecture Decision Records

Short records of _why_ the project is built the way it is. Add a new record instead of rewriting an
old one when a decision changes.

## ADR-001: Next.js monolith

A single Next.js app serves both UI and API: one deployable, shared types between client and server.
The `server/` layer keeps business logic free of Next.js so it can be extracted later if needed.

## ADR-002: Shared-schema multi-tenancy

Tenants share tables and are isolated by `organizationId`. Simpler to operate than schema-per-tenant.
Isolation is enforced in repositories; Postgres row-level security can be added as defence in depth.

## ADR-003: Database-backed sessions

Sessions are random tokens stored hashed (SHA-256) in the `Session` table and sent as HTTP-only cookies.
They can be revoked instantly, unlike JWTs. Because tokens are random, no signing secret is needed —
which is why there is no `AUTH_SECRET` variable. (Extended in ADR-019.)

## ADR-004: String-based permissions on roles — _superseded by ADR-014_

Permissions were `module:action` strings stored in an array on each role.

## ADR-005: Decimal money, double-entry ledger

All monetary values are `Decimal`. Financial documents post balanced journal entries so reports come
from the ledger.

## ADR-006: Current major versions at the foundation (phase 00)

Next.js 16, React 19, Prisma 7, Tailwind 4, Zod 4, Vitest 5. The earlier Next 15 / Prisma 6 / Vitest 3
setup carried known security advisories that only major upgrades fix, and upgrading an almost-empty
project is far cheaper than upgrading a finished ERP.

Two tools are deliberately **one major behind**:

- **ESLint 9**, not 10 — `eslint-plugin-react`, `jsx-a11y` and `import` (used by Next's config) do not support 10 yet.
- **TypeScript 6.0**, not 7 — `typescript-eslint` supports `< 6.1`.

Revisit both when those plugins add support.

## ADR-007: Prisma 7 with the `pg` driver adapter

Prisma 7 removed the connection URL from the schema; it now lives in `prisma.config.ts`, and the app
passes a driver adapter (`@prisma/adapter-pg`) to `PrismaClient`. The client is generated into
`src/generated/prisma` (git-ignored, rebuilt on install) using the new `prisma-client` generator.

The Prisma CLI (a dev-only tool) pulled in vulnerable versions of `deepmerge-ts` and `mysql2` (MySQL
support we don't use). `package.json` `overrides` pin patched versions; `prisma validate`, `generate`,
`migrate` and `db seed` were verified with them. Remove the overrides once Prisma ships the fixes.

## ADR-008: Tailwind CSS 4 + shadcn/ui (Radix, Nova preset)

shadcn/ui copies accessible, unstyled-by-default Radix components into `src/components/ui`, so we own
the code and there is no heavy component-library dependency. Radix was chosen over the other bases
(Base UI, React Aria) because it is the most widely used and battle-tested.

The shadcn CLI generates components that import `cn` from the official `cn` package (by the shadcn
team; a faster drop-in for `clsx` + `tailwind-merge`). We keep it rather than rewriting imports,
because every future `shadcn add` would reintroduce it and we would end up with two implementations.
App code imports `cn` from `@/lib/utils`, so swapping it later is a one-line change.

## ADR-009: Prettier owns formatting; lint enforces it

Prettier formats code (with the Tailwind plugin sorting class names). `eslint-config-prettier`
disables ESLint rules that would fight it. `npm run lint` runs ESLint **and** `prettier --check`, so
the four standard checks (lint, typecheck, test, build) also guarantee consistent formatting.
Run `npm run format` to fix formatting.

## ADR-010: ESLint enforces the agent rules it can

Rules from `AGENTS.md` that a machine can check are ESLint errors: no `any`, no `@ts-ignore`, no empty
blocks/catches, and no database or repository imports from `src/components` / `src/features`.

## ADR-011: Validated environment, fail fast

Environment variables are declared once in a Zod schema (`src/lib/env/schema.ts`). They are validated
at server start (`src/instrumentation.ts`) and during `next build`, so a misconfigured deployment fails
before serving traffic. Error messages name the variable but never print its value.

## ADR-012: Testing layers

- **Vitest** with two projects: `unit` (Node) and `components` (jsdom + Testing Library + jest-dom).
- **Playwright** for end-to-end tests against the real production build (`next start`) in CI.
- `server-only` is aliased to an empty module in Vitest so server code can be unit-tested directly.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally points Playwright at an already-installed Chromium.

## ADR-013: UI and UX design system (phase 01)

- **Tokens, not hard-coded colors.** Slate neutrals + one blue brand color + five status tones, all CSS
  variables with light and dark values. A unit test enforces WCAG AA contrast for every text pair.
- **Dark mode via `next-themes`** (class strategy, default = system). It only toggles a `.dark` class;
  components need no dark-specific code.
- **TanStack Table v9.** v9 became the stable release in August 2026 (v8 is no longer updated). v9
  registers features explicitly, so all tables share one feature set in `data-table-features.ts` and
  build columns with `createDataTableColumns<T>()`. The column-list type is derived from TanStack's
  own `ColumnHelper`, so project code never writes `any`.
- **Navigation as data.** One config drives sidebar, mobile menu, search and breadcrumbs; the server
  filters it by role. A unit test checks every entry has a page.
- **Honest placeholders.** Unbuilt modules show `ModulePlaceholder` — no fake figures and no buttons
  that pretend to work. The component gallery at `/design-system` is development-only and labels all
  of its content as sample data.
- **`agentRules: false` in `next.config.ts`.** Next.js 16's dev server appends its own block to
  `AGENTS.md`/`CLAUDE.md` on every run. `AGENTS.md` is our binding rules file, so the equivalent
  advice ("read the docs bundled in `node_modules`") is written there by us instead.

## ADR-014: Permissions as tables (phase 02)

`permissions` (global catalogue) + `role_permissions` (per company) replace the string array on roles.
Reasons: permissions become queryable and auditable ("who can approve invoices?"), foreign keys prevent
typos, and custom roles can be edited row by row. The catalogue is still defined in code
(`src/lib/permissions`) and synced by the seed, so code and database cannot disagree for long. Keys
stay `module:action`, so `hasPermission()` is unchanged; wildcards are only used to _define_ roles and
are expanded before storage.

## ADR-015: Core-only schema and a fresh baseline migration (phase 02)

The phase-00 draft schema contained ~20 speculative module tables (invoices, employees, stock, …) that
no code used, used "organization" naming and lacked `created_by`/`updated_by`. Phase 02 replaces it
with the core platform schema only; each module phase adds its own tables when its requirements are
known. Because **no database had been deployed**, the draft migration was replaced by a new baseline
(`20260925184444_init`) instead of a destructive "drop 20 tables" migration. From now on migrations
are append-only. Anyone with a local database from phase 00/01 should create a new empty database
(the old one can simply be dropped).

## ADR-016: Database conventions (phase 02)

- **snake_case in SQL, camelCase in TypeScript** (`@@map`/`@map`): conventional for PostgreSQL tools and
  reports, idiomatic in code.
- **UUID v7 ids** in native `uuid` columns: not guessable like serial numbers, safe to generate anywhere,
  and time-ordered so B-tree indexes stay compact (unlike random UUID v4).
- **`timestamptz`** everywhere: an ERP spans time zones; every instant is stored unambiguously in UTC.
- **`company_id` on every tenant table, including join tables, with composite foreign keys** to the
  parent: tenant isolation is enforced by the database, not only by application code, and the column
  is ready for PostgreSQL row-level security later.
- **Audit columns** `created_by`/`updated_by` are real foreign keys to `users` (`ON DELETE SET NULL`).
- **`audit_logs` is append-only** and blocks hard deletion of a company that has history (`RESTRICT`);
  `company_id` is nullable only for account-level events such as sign-in.

## ADR-017: Error handling and logging (phase 02)

A small `AppError` hierarchy with stable `code`s is the only way services report expected failures.
`handle()` (routes) and `runAction()` (server actions) convert anything thrown — including Zod and known
Prisma errors — into one response shape, so clients can rely on `error.code`. Unexpected errors return a
generic message plus a `requestId` and are logged in full by a redacting structured logger; internals are
never sent to the browser. No third-party logging library yet: JSON lines on stdout are what hosting
platforms (e.g. Vercel) ingest; a vendor can be added behind `logger` later.

## ADR-018: Integration tests against real PostgreSQL (phase 02)

Services and constraints are tested against a real, migrated PostgreSQL database — never mocks — because
most multi-tenant bugs live in queries and constraints. The runner refuses any database whose name lacks
"test" and empties tables before each test. The seed runs with `tsx --conditions=react-server` so it can
reuse the real services (which import `server-only` modules) instead of duplicating their logic.

## ADR-019: Own authentication instead of an auth provider (phase 03)

The project already had its own database sessions (ADR-003), so phase 03 completes that instead of adding a
provider (Auth.js, Clerk, …): tenant-aware sessions, invitations into companies and permission checks all live
next to the data, with no extra service, cost or vendor lock-in. Security properties implemented explicitly:
bcrypt (cost 12), 256-bit random session and link tokens stored hashed, idle (7 d) + absolute (30 d) session
expiry, new token on every sign-in, account lockout (5 failures / 15 min), no account enumeration on sign-in,
registration or password reset, single-use and expiring email links that require a button press, sign-out
everywhere after a password reset, safe same-site `next` redirects, and audit entries for every account event.
If SSO (SAML/OIDC) is needed later, it can be added as another way to create a session.

## ADR-020: Permission constants and vocabulary (phase 03)

Permissions are an explicit list of `module:action` keys (`PERMISSION_KEYS`) rather than a generated
module × action cross product: only meaningful combinations exist (e.g. `approve`/`reject` only where there are
requests to approve; `manage` only for users, roles and settings) and TypeScript rejects typos. Verbs follow the
product vocabulary: `view`, `create`, `edit`, `delete`, `export`, `approve`, `reject`, `manage`. The migration
renamed `read→view` and `update→edit` in place, so existing grants survived.

## ADR-021: Authorization enforced in layers (phase 03)

Proxy (cookie present?) → layout (valid session, company access) → page `authorizePage()` → action/route
`requirePermission()` → service `authorize()`. The proxy is optimistic by design (Next.js recommends it for fast
redirects only). Next's `forbidden()` requires an experimental flag, so pages render `<AccessDenied />` instead.
Privilege escalation is prevented with one rule — you can only grant or assign permissions you hold — which
also covers "Admins can't create Super Admins" without special cases.

## ADR-022: Email delivery (phase 03)

`sendEmail()` with three transports chosen by `EMAIL_TRANSPORT`: `smtp` (nodemailer; required in production and
validated at startup), `console` (development/CI: the email, including its link, is printed to the log) and
`memory` (tests only: integration tests and the e2e fixture read the link from the captured email, so flows are
tested end to end without a mail server). A failed email is logged and reported to the user (e.g. "use Resend
invitation") instead of silently failing or rolling back the saved change.

## ADR-023: Navigation config is plain data (phase 03)

`src/config/navigation.ts` holds icon _names_; `src/components/layout/nav-icons.ts` maps them to icon components.
Server code (post-login landing page, permission-filtered menus) can import the config without pulling a UI
library into server-only scripts such as the seed and e2e fixtures.

## ADR-024: Tenant guard in the database client (phase 04)

Scoping every query by `company_id` by convention alone fails the first time someone forgets a filter. A Prisma
client extension therefore **rejects** any query on a company-owned model whose `where` (or insert data) lacks
`companyId` — a tripwire rather than silent auto-injection, so the code stays explicit and readable and mistakes
surface in tests immediately. Legitimate cross-company queries are wrapped in `crossTenant("reason", …)`
(AsyncLocalStorage scope), allowed only in repositories (ESLint rule). Together with composite foreign keys this
gives database-level integrity plus runtime query checks without PostgreSQL row-level security; RLS
(`SET LOCAL app.company_id` per transaction + policies) remains an option for phase 16 as defense in depth.

## ADR-025: Active company stored on the session (phase 04)

The company switcher stores the choice on the session row (`sessions.active_company_id`), not in a cookie or URL:
it can't be tampered with, it's per device, and it is re-validated against memberships on every request (a suspended
membership falls back to the user's oldest company). URLs stay company-free, so links can be shared inside a company
without leaking which tenant they belong to.

## ADR-026: File storage abstraction (phase 04)

A three-method `StorageDriver` (`put`/`get`/`delete`) with a local-folder driver and an S3-compatible driver
(`aws4fetch`, ~7 kB, no dependencies — instead of the full AWS SDK). Serverless hosts (e.g. Vercel) have no
persistent disk, so production defaults to `s3` and refuses to start without its settings; a single server with a
disk can opt into `local`. Files are served through the app (tenant check on every request) rather than public
bucket URLs; signed URLs can be added later for large files. Uploaded images are validated by their bytes; SVG is
refused because it can carry scripts.

## ADR-027: Dashboard widgets as registry + providers (phase 05)

The PRD dashboard lists figures from modules that arrive in later phases. Instead of placeholder numbers, each
widget is declared once (`src/config/dashboard.ts`: module, permissions) and gets its data from a provider in
`dashboardService`; a widget without a provider is reported as `unavailable` and rendered as "not tracked yet".
This keeps the page honest today and makes each later phase a local change (add a provider), with no dashboard
rewrite. Widgets load independently (per-widget error handling, per-section streaming), so one failing query
doesn't blank the page. Date ranges are month-based presets resolved in the company's time zone and fiscal year,
because monthly charts and "this fiscal year" are what ERP users compare; arbitrary day ranges can be added in
reports (phase 14).

## ADR-028: Charts with Recharts via shadcn/ui (phase 05)

The shadcn `chart` component (Recharts 3) matches the existing design system (theme tokens `--chart-1…5`, dark
mode) and is responsive out of the box. Charts are client components fed plain serialisable data from the server;
each one also renders a visually hidden table with the same numbers for screen readers.

## ADR-029: Per-company record numbers from a counter table (phase 06)

Customer and lead IDs (`CUS-0001`, `LEAD-0001`) come from `number_sequences`, incremented with one atomic
`INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the transaction that creates the record: no duplicates under
concurrency, no gaps from rolled-back creates, numbers never reused after deletes. `MAX(number)+1` was rejected
(races) and PostgreSQL sequences were rejected (one per company and type, and they skip on rollback). Invoices will
use the same counter.

## ADR-030: CRM relations to modules that don't exist yet (phase 06)

A lead's "assigned employee" is a company member (user) until the HR module adds employee records; the service
checks the member belongs to the current company. A customer's invoices, payments and projects tabs say
"not tracked yet" with the delivering phase instead of showing sample rows. Customer documents are served only
as downloads (`Content-Disposition: attachment`, `nosniff`, sandbox CSP) and their type is detected from the bytes,
so an uploaded file can never run as a page of the app.

## ADR-031: Exact money arithmetic with decimal strings and BigInt (phase 07)

Amounts travel as decimal strings ("1250.50") from form to database (NUMERIC(18,2)) and are calculated with
BigInt fixed-point integers in `src/lib/money.ts`: no binary floating point, identical results in the browser and
on the server, and values beyond `Number.MAX_SAFE_INTEGER` cents stay exact. Rounding is half away from zero per
line (subtotal, discount, tax), and document totals are the sums of the rounded lines, so every printed figure adds
up. decimal.js was not added: the needed operations are few and the BigInt code has no dependency.

## ADR-032: A sales order is a confirmed quotation (phase 07)

Instead of copying a quotation into a separate order table, confirming it assigns a sales-order number to the same
record (the approach Odoo uses). Lines and totals can't diverge, and the audit history covers both stages.
Statuses that depend only on dates ("Expired" quotation, "Overdue" invoice) are derived when read, so no scheduled
job is needed and they can't be stale; list filters apply the same rule in SQL.

## ADR-033: Invoice numbers, payments and consistency (phase 07)

Invoice numbers use the company prefix setting and a per-company counter, are stored as issued text and never
change; issued invoices are cancelled rather than deleted (drafts can be deleted, which may leave a gap).
Recording or voiding a payment locks the invoice row (`SELECT … FOR UPDATE`) in one transaction, recomputes
`amount_paid` from the non-voided payments and sets the status — concurrent payments can't overpay. Database CHECK
constraints back the same rules. Payments are voided with a reason instead of deleted.

## ADR-034: PDFs with pdf-lib; sharing via expiring links (phase 07)

pdf-lib (pure JavaScript, no headless browser) renders quotations and invoices on the server, so it works on
serverless hosts. It uses the built-in Helvetica font, which covers Western European text; other scripts are
replaced by "?" instead of failing — embedding a Unicode font (with Arabic shaping) is a later improvement. The
same view model feeds the screen, the print page and the PDF. For WhatsApp, the app opens `wa.me` with a message
that contains a share link: a random 256-bit token (only its hash is stored), 30-day expiry, revocable, limited to
one document. A WhatsApp Business API integration can later send the same message from the server.

## ADR-035: Double-entry ledger enforced by the database (phase 08)

Accounting is a real double-entry journal (`journal_entries` + `journal_lines`) rather than per-module totals, so
the P&L, balance sheet and cash flow all read one source. Balance (Σ debit = Σ credit) is checked in the service
with exact BigInt arithmetic, and again by the database: a CHECK constraint (one side per line) and a deferred
constraint trigger that runs at commit, so even raw SQL or a future bug can't store an unbalanced entry. Balances
are computed from the lines when read (no stored running totals to drift).

## ADR-036: Immutable postings with posting keys and reversals (phase 08)

Posted entries are never edited or deleted; corrections are reversing entries that point at the original.
Automatic postings are written in the same transaction as their source change and carry a unique
`(company_id, posting_key)` such as `invoice:<id>:issue`, which makes them idempotent: retries can't double-post,
and the seed can back-fill phase-07 invoices and payments safely. Automatic postings are corrected only from their
source (cancel the invoice, void the payment), keeping the sub-ledgers and the ledger in agreement; AR/AP reports
show the reconciliation instead of assuming it.

## ADR-037: Expense approval with owner-scoped visibility (phase 08)

Expenses post to the ledger only when approved (accrual at the expense date; "Not paid yet" goes to Accounts
Payable). Visibility is a record-level rule in the service: approvers and accountants see all expenses, everyone
else only their own, enforced in the repository query so lists, detail pages and the API agree. Receipts reuse the
storage layer with company-prefixed keys.

## ADR-038: Salary and bank details as a restricted, encrypted sub-record (phase 09)

Pay data lives in `employee_compensations`, never selected with the employee profile, behind its own permission
module (`salaries:view` / `salaries:edit`) so managers can run their team without seeing pay. Bank account numbers
and IBANs are encrypted with AES-256-GCM using an app key (`DATA_ENCRYPTION_KEY`) and the record identity as
authenticated data; the last four characters are stored for masking, and full values are returned only by an
explicit, audited reveal. Salary stays a plain NUMERIC so payroll can aggregate it in SQL; its protection is the
separate table, the permission and audit redaction. Database-level encryption (pgcrypto) was not used: the key
would travel in SQL and appear in query logs.

## ADR-039: Attendance rules as pure functions, absences derived on read (phase 09)

Late, early departure and half day are computed by pure, unit-tested functions from the company work schedule in
its time zone and stored on the record (so a later schedule change doesn't rewrite history). Check-in uses the
server clock only. Absent and on-leave days are derived when reports are read (working day, employed, no record,
approved leave) instead of being written by a nightly job, so there is no scheduler to run and nothing to go stale.
GPS, device/IP restrictions and biometrics are documented future options, not partial implementations.

## ADR-040: Leave approval with overlap check under a row lock and no self-approval (phase 09)

A leave request counts working days from the schedule, may not overlap the employee's pending or approved leave
(checked inside a transaction holding `SELECT … FOR UPDATE` on the employee row, so concurrent requests
serialize), and can't be approved or rejected by the person it belongs to. An exclusion constraint (btree_gist)
would also work but needs a Postgres extension that some hosts don't enable.
