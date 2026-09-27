# Database

PostgreSQL (15+, developed on 16) through **Prisma 7**. Schema: `prisma/schema.prisma`.
Prisma settings (connection URL, migrations folder, seed command): `prisma.config.ts`.

## What exists today (phases 02–04)

The **core platform** tables. ERP module tables (invoices, employees, stock, …) are added by the
phase that builds each module, so every table is designed with its real requirements.

```
companies ──┬── memberships ── users ──┬── sessions
            │                          └── auth_tokens (email links)
            ├── roles ── role_permissions ── permissions (global catalogue)
            ├── settings
            ├── audit_logs (append-only; company optional)
            ├── customers  (reference module)
            └── notifications
```

| Table              | Tenant-owned                               | Purpose                                                                                                                                                  |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies`        | — (is the tenant)                          | A customer company: name, legal name, tax id, contact details, country, base currency, time zone, locale, fiscal year, status, logo (storage key + type) |
| `users`            | no (global)                                | A person's login. Linked to companies through `memberships`                                                                                              |
| `sessions`         | no                                         | Signed-in browser sessions (hashed tokens only; idle + absolute expiry; `active_company_id` = company chosen in the switcher)                            |
| `auth_tokens`      | no (optional `company_id` for invitations) | Single-use email links: verification, password reset, invitation (hashed)                                                                                |
| `permissions`      | no (global)                                | Catalogue of `module:action` keys, synced from code                                                                                                      |
| `roles`            | `company_id`                               | Named permission sets per company (Owner, Admin, … + custom later)                                                                                       |
| `role_permissions` | `company_id`                               | Which permissions a role has                                                                                                                             |
| `memberships`      | `company_id`                               | A user's access to a company, with exactly one role there                                                                                                |
| `settings`         | `company_id`                               | Validated per-company preferences (key → JSON value)                                                                                                     |
| `audit_logs`       | `company_id` (null for sign-in events)     | Immutable history of important actions                                                                                                                   |
| `customers`        | `company_id`                               | Reference module for the repository → service → route pattern                                                                                            |
| `notifications`    | `company_id`                               | In-app notifications (the header bell)                                                                                                                   |

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
   `customers`, `notifications`, `audit_logs`), with composite foreign keys for children.
2. **Repositories:** every function takes `companyId` first and filters by it, including `updateMany` / `deleteMany`
   (a guessed id of another company updates or deletes **0 rows**).
3. **Tenant guard** (`src/lib/db/tenant-guard.ts`): a Prisma client extension on the shared `db` client that throws
   `TenantScopeError` for any query on those tables whose `where` (or insert data) has no `companyId` — including
   inside transactions. It checks top-level `companyId` and compound unique keys such as `companyId_name`.
   Intentional cross-company queries are wrapped in `crossTenant("reason", () => …)`; today there are three, all
   about a user's _own_ memberships (default company, company switcher list, activating invitations).

Not covered by the guard (review these by hand): raw SQL (`$queryRaw`, `$executeRaw`) and nested relation queries
(they are reached through an already-scoped parent). Raw SQL is used only where Prisma can't express the query
(today: `customerRepository.countCreatedByMonth`, grouping by month in the company's time zone); it always filters
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

| Migration                                 | Contents                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260925184444_init`                     | Core platform schema (phase 02). Replaced the phase-00 draft before any deployment — see ADR-015.                                                                                                                                                                                                                 |
| `20260926172858_auth_and_rbac`            | Phase 03: `auth_tokens`, user security columns (verification, lockout, profile), session absolute expiry. **Data migration:** permission verbs `read→view`, `update→edit`; role `Owner→Super Admin`; retired `Sales Rep` kept as a custom role; existing users marked verified. Run `npm run db:seed` afterwards. |
| `20260926181244_company_context_and_logo` | Phase 04: `sessions.active_company_id` (company switcher, `SET NULL` if the company is deleted); `companies.logo_key`, `logo_content_type`, `logo_updated_at`.                                                                                                                                                    |
