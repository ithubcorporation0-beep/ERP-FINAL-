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
