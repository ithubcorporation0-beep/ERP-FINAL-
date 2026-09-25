# Database

## Overview

- **PostgreSQL 15+** (developed and tested on 16).
- **Prisma 7** is the ORM. The schema is `prisma/schema.prisma`; Prisma settings are in `prisma.config.ts`.
- The app connects through Prisma's PostgreSQL **driver adapter** (`@prisma/adapter-pg`), created in
  `src/lib/db/index.ts`. Only one client is created per server process (and reused across hot reloads).
- The generated client is written to `src/generated/prisma/` (git-ignored) and regenerated
  automatically on `npm install`. Import types from `@/generated/prisma/client`.

## Design rules

- **Multi-tenancy:** shared database, shared schema. Every top-level business table has an indexed
  `organizationId` column; child tables (e.g. `InvoiceItem`, `JournalLine`) inherit the organization
  through their parent. Every query must be scoped by `organizationId`.
- **Money:** `Decimal(14,2)`, never floating point. Quantities use `Decimal(14,3)`.
- **Soft delete:** `deletedAt` on master data (customers so far); financial records are voided, not deleted.
- **Accounting:** double entry through `JournalEntry` + `JournalLine`; debits must equal credits.
- **Document numbers** (`Invoice.number`, `Purchase.number`) are unique per organization.
- **IDs:** `cuid()` strings — safe to expose in URLs and not guessable in sequence.

## Local setup

You need a PostgreSQL server. Two easy options:

```bash
# Option A — Docker
docker run -d --name erp-db -p 5432:5432 \
  -e POSTGRES_USER=erp -e POSTGRES_PASSWORD=erp -e POSTGRES_DB=it_hub_erp postgres:16

# Option B — a hosted database (Neon, Supabase, Vercel Postgres, …): copy its connection string.
```

Put the connection string in `.env` as `DATABASE_URL`, then:

```bash
npm run db:deploy   # create all tables from the committed migrations
npm run db:seed     # demo organization, default roles, chart of accounts, admin user
```

## Changing the schema

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate -- --name short_description` — creates a new SQL file in `prisma/migrations/`
   and applies it to your local database.
3. Commit the schema **and** the new migration folder together.

Never edit a migration that has already been committed or deployed; create a new one instead.

## Commands

| Command               | What it does                                                   |
| --------------------- | -------------------------------------------------------------- |
| `npm run db:generate` | Regenerate the Prisma client (also runs on `npm install`)      |
| `npm run db:migrate`  | Create + apply a migration in development                      |
| `npm run db:deploy`   | Apply committed migrations (production, CI, fresh local setup) |
| `npm run db:seed`     | Seed demo data (idempotent — safe to run twice)                |
| `npm run db:studio`   | Browse the database in a web UI                                |

## Migrations

| Migration             | Contents                       |
| --------------------- | ------------------------------ |
| `20260925090410_init` | Initial schema for all modules |
