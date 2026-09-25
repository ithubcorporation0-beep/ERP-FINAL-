# API

All endpoints live under `/api`, use JSON, and authenticate with the `erp_session` HTTP-only cookie.

## Errors

Every error has the same shape and an `x-request-id` header:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Some fields are invalid.",
    "details": { "name": ["Too small: expected string to have >=1 characters"] },
    "requestId": "511203f7-…"
  }
}
```

| Status | `code`              | Meaning                                                    |
| ------ | ------------------- | ---------------------------------------------------------- |
| 401    | `UNAUTHENTICATED`   | Not signed in, or wrong credentials                        |
| 403    | `FORBIDDEN`         | Missing permission / no access to the company              |
| 404    | `NOT_FOUND`         | Not found, malformed id, or belongs to another company     |
| 409    | `CONFLICT`          | Duplicate or still-referenced data                         |
| 422    | `VALIDATION_FAILED` | Invalid input; `details` lists the problems per field      |
| 500    | `INTERNAL`          | Unexpected error — quote the `requestId` when reporting it |
| 501    | —                   | Endpoint not implemented yet                               |

Ids are UUIDs (v7). The company is always taken from the signed-in user's membership, never from the request.

## Auth

| Method | Path               | Body                  |
| ------ | ------------------ | --------------------- |
| POST   | `/api/auth/login`  | `{ email, password }` |
| POST   | `/api/auth/logout` | —                     |
| GET    | `/api/auth/me`     | —                     |

## Customers

| Method | Path                                     | Permission         |
| ------ | ---------------------------------------- | ------------------ |
| GET    | `/api/customers?page=&pageSize=&search=` | `customers:read`   |
| POST   | `/api/customers`                         | `customers:create` |
| GET    | `/api/customers/:id`                     | `customers:read`   |
| PATCH  | `/api/customers/:id`                     | `customers:update` |
| DELETE | `/api/customers/:id` (soft delete)       | `customers:delete` |

List responses: `{ items, total, page, pageSize }`. Records include `companyId`, `createdAt`, `updatedAt`, `createdById`, `updatedById`.

## Planned

leads, invoices, payments, expenses, employees, attendance, leaves, payroll, projects, tasks,
products, suppliers, purchases, inventory, accounting, reports. See `MASTER-ERP-BUILD-PLAN.md`.
