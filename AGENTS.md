# Rules for AI Agents

These rules are binding for every AI agent (and human) changing this repository.
Read `docs/architecture.md` before starting work.

## Architecture rules

1. Inspect the current code before changing anything.
2. Do not destroy working features.
3. Do not create duplicate implementations — extend the existing one.
4. Do not create fake data as a final implementation (seed/demo data belongs in `prisma/seed.ts` only).
5. Do not hide errors — no empty `catch` blocks, no swallowing failures; log and surface them.
6. Do not bypass TypeScript errors (`@ts-ignore`, `@ts-expect-error`, non-null `!` to silence errors, casts to escape types).
7. Do not use `any` unless absolutely unavoidable, and then document why in a comment on that line.
8. Do not expose secrets — never commit `.env`, never send secrets to the client, never log them.
9. Do not put database access in reusable UI components.
10. Use services/repositories for business/data operations (`src/server/services`, `src/server/repositories`).
11. Validate every external input with Zod (`src/lib/validation`).
12. Enforce authentication server-side.
13. Enforce permissions server-side (`requirePermission(module, action)`).
14. Enforce tenant/company isolation server-side — every query is scoped by `companyId` (`company_id`).
15. Record important actions in audit logs (`writeAuditLog` from `@/server/services/audit.service`, in the same transaction as the change).
16. Every module must have loading, empty, error and success states.
17. Every destructive action must require confirmation (`ConfirmButton`).
18. Use accessible UI components (labels on inputs, semantic elements, keyboard support, `role="alert"` for errors).
19. Keep components small and reusable.
20. Do not proceed to the next phase automatically — stop and report when a phase is done.
21. After every phase, run the checks below and commit using that phase's commit message.
22. Update documentation (`docs/`, `MASTER-ERP-BUILD-PLAN.md`) when architecture changes.

## Where things go

| Concern                             | Location                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Prisma queries                      | `src/server/repositories/*.repository.ts` — only place that calls `db.<model>` for business data                    |
| Business rules, transactions, audit | `src/server/services/*.service.ts`                                                                                  |
| Route handlers / server actions     | `src/app/api/**`, `src/server/actions/**` — parse → authorize → call service                                        |
| Zod schemas                         | `src/lib/validation` (env vars: `src/lib/env/schema.ts`)                                                            |
| Prisma types                        | `@/generated/prisma/client` (generated, never edit)                                                                 |
| Errors / logging                    | Throw `AppError`s from `@/lib/errors`; wrap routes in `handle()`, actions in `runAction()`; log with `@/lib/logger` |
| Company settings                    | Registry `src/lib/settings/registry.ts` + `settingsService`                                                         |
| Database conventions                | `docs/database.md` (snake_case, UUID v7, `company_id`, audit columns, composite FKs)                                |
| shadcn/ui primitives                | `src/components/ui` — add with `npx shadcn@latest add <name>`                                                       |
| Shared UI                           | `src/components/**` — no data access (ESLint enforces this)                                                         |
| Module UI                           | `src/features/<module>`                                                                                             |

Reference implementation: the `customers` module.

## Framework versions

This project uses current major versions (Next.js 16, React 19, Prisma 7, Tailwind 4, TanStack Table 9,
Zod 4) that may differ from an AI model's training data. Before using an unfamiliar API, read the docs
bundled with the installed package: `node_modules/next/dist/docs/`, and the `skills/` folders in
`node_modules/@tanstack/react-table` and `node_modules/@tanstack/table-core`. See `docs/decisions.md`.

## Phases and commits

The roadmap is `MASTER-ERP-BUILD-PLAN.md`: 16 phases, each committed as
`feat(phase-NN): <description>` using the exact message listed there. Work only on the phase you
were asked to do, and update its status in the plan in the same commit.

## Checks (must pass before every commit)

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Also run `npx prisma validate` whenever `prisma/schema.prisma` changes, and commit the new
migration created by `npm run db:migrate`. `npm run format` fixes formatting failures reported by lint.
