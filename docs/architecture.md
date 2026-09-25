# Architecture

IT Hub ERP is a single Next.js (App Router) application backed by PostgreSQL through Prisma.

## Layers

```
src/app/(dashboard)/*      UI routes (React Server Components)
src/app/api/*              REST route handlers — thin: parse → authorize → call service
src/server/actions         Server Actions used by forms
src/server/services        Business rules, transactions, audit logging
src/server/repositories    Prisma queries, always scoped by organizationId
src/lib/*                  Cross-cutting infrastructure (auth, db, tenant, permissions, audit, …)
src/features/*             Module-specific client components & hooks
src/components/*           Shared, module-agnostic UI
```

Rules:

1. Route handlers and actions never call Prisma directly; they go through a service.
2. Services receive a `TenantContext` (from `requireTenant` / `requirePermission`) and pass
   `ctx.organizationId` to repositories. A repository function with no `organizationId` argument is a bug.
3. Every mutation writes an `AuditLog` row in the same transaction.
4. Input is validated with Zod schemas in `src/lib/validation`.

## Reference module

`customers` is the fully wired reference implementation:
`api/customers/route.ts` → `customer.service.ts` → `customer.repository.ts`.
New modules copy this shape. The other API folders are permission-checked stubs that return `501`.
