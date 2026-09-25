# API

All endpoints live under `/api`, use JSON, and authenticate with the `erp_session` HTTP-only cookie.

## Errors

| Status | Meaning |
|--------|---------|
| 401 | Not signed in |
| 403 | Missing permission / no access to organization |
| 404 | Not found (or belongs to another organization) |
| 422 | Validation failed — body contains `issues` |
| 501 | Endpoint not implemented yet |

## Auth

| Method | Path | Body |
|--------|------|------|
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/logout` | — |
| GET  | `/api/auth/me` | — |

## Customers

| Method | Path | Permission |
|--------|------|------------|
| GET    | `/api/customers?page=&pageSize=&search=` | `customers:read` |
| POST   | `/api/customers` | `customers:create` |
| GET    | `/api/customers/:id` | `customers:read` |
| PATCH  | `/api/customers/:id` | `customers:update` |
| DELETE | `/api/customers/:id` (soft delete) | `customers:delete` |

List responses: `{ items, total, page, pageSize }`.

## Planned

leads, invoices, payments, expenses, employees, attendance, leaves, payroll, projects, tasks,
products, suppliers, purchases, inventory, accounting, reports. See `MASTER-ERP-BUILD-PLAN.md`.
