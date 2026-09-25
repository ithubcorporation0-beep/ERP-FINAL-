# IT Hub ERP

A multi-tenant ERP built with **Next.js 15, TypeScript, Prisma and PostgreSQL**.
Modules: CRM, Sales, Finance/Accounting, HR & Payroll, Projects, Inventory & Purchasing, Reports, Notifications and Audit Logs.

## Quick start

```bash
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npm install
npm run db:migrate            # creates the schema
npm run db:seed               # demo org + admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
npm run dev                   # http://localhost:3000
```

## Scripts

| Script | Purpose |
|--------|---------|
| `dev` / `build` / `start` | Next.js |
| `lint` / `typecheck` / `test` | Quality gates (run in CI) |
| `db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma |

## Project layout

```
prisma/            schema, migrations, seed
src/app/           routes: (auth), (dashboard)/<module>, api/<resource>
src/components/    shared UI (ui, layout, forms, tables, charts, shared)
src/features/      module-specific client components
src/lib/           auth, db, permissions, tenant, validation, audit, storage, email, pdf, utils
src/server/        services, repositories, actions
tests/             unit, integration, e2e
docs/              architecture, database, permissions, deployment, api, decisions
```

See [docs/architecture.md](docs/architecture.md) for how the layers fit together, and
[MASTER-ERP-BUILD-PLAN.md](MASTER-ERP-BUILD-PLAN.md) for the roadmap.
