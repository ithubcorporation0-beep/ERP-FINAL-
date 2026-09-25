# Architecture Decision Records

## ADR-001: Next.js monolith

A single Next.js app serves both UI and API. It gives one deployable and shared types between client and server.
The `server/` layer keeps business logic free of Next.js so it can be extracted later if needed.

## ADR-002: Shared-schema multi-tenancy

Tenants share tables and are isolated by `organizationId`. This is simpler to operate than schema-per-tenant.
Isolation is enforced in repositories. Postgres row-level security can be added later as defence in depth.

## ADR-003: Database-backed sessions

Sessions are random tokens stored hashed (SHA-256) in the `Session` table, sent as HTTP-only cookies.
They can be revoked instantly, which JWTs cannot.

## ADR-004: String-based permissions on roles

Permissions are `module:action` strings on each role, not a join table. Roles stay editable per organization,
and checks are a simple in-memory lookup.

## ADR-005: Decimal money, double-entry ledger

All monetary values are `Decimal`. Financial documents post balanced journal entries so reports come from the ledger.
