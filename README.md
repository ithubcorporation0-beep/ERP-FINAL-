# IT Hub ERP

A multi-company ERP (CRM, sales, finance, HR, payroll, projects, inventory, reports) built with
**Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Prisma 7 and PostgreSQL**.

> **Status:** Phase 02 — database and backend foundation. ERP modules are built phase by phase; see
> [MASTER-ERP-BUILD-PLAN.md](MASTER-ERP-BUILD-PLAN.md).

## Prerequisites

- **Node.js 22.12 or newer** (`node -v`). With nvm: `nvm use` reads `.nvmrc`.
- **PostgreSQL 15+** — local Docker or a hosted database (Neon, Supabase, …). See [docs/database.md](docs/database.md).

## Getting started

```bash
cp .env.example .env     # 1. create your local settings file, then edit DATABASE_URL
npm install              # 2. install dependencies (also generates the Prisma client)
npm run db:deploy        # 3. create the database tables
npm run db:seed          # 4. first company + Owner account (set SEED_* in .env first; no fake data)
npm run dev              # 5. open http://localhost:3000 and sign in as the seed admin
```

## Scripts

| Command             | What it does                                                                      |
| ------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`       | Start the development server with hot reload                                      |
| `npm run build`     | Create an optimized production build                                              |
| `npm run start`     | Serve the production build                                                        |
| `npm run lint`      | ESLint + Prettier formatting check                                                |
| `npm run lint:fix`  | Auto-fix lint and formatting problems                                             |
| `npm run format`    | Format all files with Prettier                                                    |
| `npm run typecheck` | TypeScript type check                                                             |
| `npm run test`      | Unit and component tests (Vitest)                                                 |
| `npm run test:e2e`  | End-to-end browser tests (Playwright; run `npx playwright install chromium` once) |
| `npm run db:*`      | Database commands — see [docs/database.md](docs/database.md)                      |

**Before every commit:** `npm run lint && npm run typecheck && npm run test && npm run build`

## Project layout

```
prisma/              database schema, migrations, seed
src/app/             pages and API routes: (auth)/, (dashboard)/<module>/, api/<resource>/
src/components/      shared UI — ui/ (shadcn), shared/, layout/, forms/, tables/, charts/
src/features/        UI that belongs to a single module
src/server/          services (business rules) and repositories (database queries), server actions
src/lib/             infrastructure — auth, db, env, permissions, tenant, validation, audit, utils
tests/               unit/, integration/, e2e/
docs/                architecture, database, permissions, deployment, api, decisions
```

## Documentation

| Doc                                          | Read it when…                                          |
| -------------------------------------------- | ------------------------------------------------------ |
| [AGENTS.md](AGENTS.md)                       | **Before any change** — rules for humans and AI agents |
| [docs/architecture.md](docs/architecture.md) | You want to know where code goes and why               |
| [docs/database.md](docs/database.md)         | You set up or change the database                      |
| [docs/deployment.md](docs/deployment.md)     | You deploy or configure CI                             |
| [docs/decisions.md](docs/decisions.md)       | You wonder why something was chosen                    |
| [docs/permissions.md](docs/permissions.md)   | You work on roles and access control                   |
| [docs/api.md](docs/api.md)                   | You call or build API endpoints                        |
