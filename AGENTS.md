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
14. Enforce tenant/company isolation server-side — every query is scoped by `organizationId`.
15. Record important actions in audit logs (`writeAuditLog`, in the same transaction as the change).
16. Every module must have loading, empty, error and success states.
17. Every destructive action must require confirmation (`ConfirmButton`).
18. Use accessible UI components (labels on inputs, semantic elements, keyboard support, `role="alert"` for errors).
19. Keep components small and reusable.
20. Do not proceed to the next phase automatically — stop and report when a phase is done.
21. After every phase, run the checks below and commit using that phase's commit message.
22. Update documentation (`docs/`, `MASTER-ERP-BUILD-PLAN.md`) when architecture changes.

## Where things go

| Concern | Location |
|---------|----------|
| Prisma queries | `src/server/repositories/*.repository.ts` — only place that calls `db.<model>` for business data |
| Business rules, transactions, audit | `src/server/services/*.service.ts` |
| Route handlers / server actions | `src/app/api/**`, `src/server/actions/**` — parse → authorize → call service |
| Zod schemas | `src/lib/validation` |
| Shared UI | `src/components/**` — no data access |
| Module UI | `src/features/<module>` |

Reference implementation: the `customers` module.

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

Also run `npx prisma validate` whenever `prisma/schema.prisma` changes.
