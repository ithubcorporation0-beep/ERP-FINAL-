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
which is why there is no `AUTH_SECRET` variable.

## ADR-004: String-based permissions on roles

Permissions are `module:action` strings on each role rather than a join table. Roles stay editable per
organization and checks are a simple in-memory lookup.

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
