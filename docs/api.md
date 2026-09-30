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

| Method | Path               | Body                                                                                               |
| ------ | ------------------ | -------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`  | `{ email, password }` → 200 user, or 401 (invalid credentials, locked account or unverified email) |
| POST   | `/api/auth/logout` | —                                                                                                  |
| GET    | `/api/auth/me`     | — → the caller's `TenantContext` (user, company, role, permissions)                                |

## Customers

| Method | Path                                     | Permission         |
| ------ | ---------------------------------------- | ------------------ |
| GET    | `/api/customers?page=&pageSize=&search=` | `customers:view`   |
| POST   | `/api/customers`                         | `customers:create` |
| GET    | `/api/customers/:id`                     | `customers:view`   |
| PATCH  | `/api/customers/:id`                     | `customers:edit`   |
| DELETE | `/api/customers/:id` (soft delete)       | `customers:delete` |

List responses: `{ items, total, page, pageSize }`. Records include `companyId`, `createdAt`, `updatedAt`, `createdById`, `updatedById`.

## HR (phase 09)

Rules: `docs/hr.md`. People who may only see their own attendance / leave get only their own records.

| Method              | Path                                                                                                    | Permission                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| GET / POST          | `/api/employees?search=&status=&departmentId=`                                                          | `employees:view` / `employees:create`                  |
| GET / PUT / DELETE  | `/api/employees/:id` (never includes salary or bank)                                                    | `employees:view` / `edit` / `delete`                   |
| POST                | `/api/employees/:id/status` `{ status, exitDate?, note? }`                                              | `employees:edit`                                       |
| GET / POST / DELETE | `/api/employees/:id/photo` (multipart `file`)                                                           | `employees:view` / `employees:edit`                    |
| GET / POST          | `/api/employees/:id/documents`, `…/documents/:documentId` (GET, DELETE)                                 | `employees:view` / `employees:edit`                    |
| GET / PUT           | `/api/employees/:id/compensation` (`?reveal=1` = full bank numbers, audited)                            | `salaries:view` / `salaries:edit`                      |
| GET / POST          | `/api/departments`; PUT / DELETE `/api/departments/:id`                                                 | `employees:view` / `create` / `edit` / `delete`        |
| POST                | `/api/attendance/check-in`, `/api/attendance/check-out` (server time)                                   | `attendance:create`                                    |
| GET / POST          | `/api/attendance?employeeId=&range=` / HR entry `{ employeeId, date, absent, checkIn, checkOut, note }` | `attendance:view` / `attendance:edit`                  |
| GET / DELETE        | `/api/attendance/:id`                                                                                   | `attendance:view` / `attendance:delete`                |
| GET                 | `/api/attendance/today`, `/api/attendance/report?range=&departmentId=`                                  | `attendance:view` + sees everyone                      |
| GET / POST          | `/api/leaves?status=&type=&employeeId=&mine=1`                                                          | `leaves:view` / `leaves:create`                        |
| GET / DELETE        | `/api/leaves/:id` (DELETE = cancel a pending request)                                                   | `leaves:view` (+ own request or `leaves:delete`)       |
| POST                | `/api/leaves/:id/decision` `{ decision: "approve" \| "reject", note }`                                  | `leaves:approve` / `leaves:reject`, not your own       |
| GET / POST          | `/api/leaves/:id/attachment` (multipart `file`)                                                         | `leaves:view` (+ own pending request or `leaves:edit`) |

## Payroll (phase 10)

Rules: `docs/payroll.md`. All responses carrying pay are `Cache-Control: private, no-store`.

| Method              | Path                                                                                                | Permission                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| GET / POST          | `/api/payroll?status=` / process `{ period: "YYYY-MM", payDate, notes? }` (409 if the month exists) | `payroll:view` / `payroll:create`                                                    |
| GET                 | `/api/payroll/:id` (run, payslips, totals)                                                          | `payroll:view`                                                                       |
| POST                | `/api/payroll/:id/status` `{ action: submit \| approve \| reject \| cancel \| pay, … }`             | per step: `payroll:edit` / `approve` / `reject` / `delete`; pay: `accounting:create` |
| POST                | `/api/payroll/:id/recalculate`                                                                      | `payroll:edit`                                                                       |
| PUT                 | `/api/payroll/:id/items/:itemId` `{ basic, allowances, bonus, overtime, deductions, tax, note? }`   | `payroll:edit` (draft only)                                                          |
| GET                 | `/api/payroll/:id/items/:itemId/slip` (PDF, `?download=1`)                                          | `payroll:view`                                                                       |
| GET / POST / DELETE | `/api/payroll/advances`, `/api/payroll/advances/:id` (cancel)                                       | `payroll:view` / `create` / `delete`                                                 |
| GET                 | `/api/payroll/report?range=`                                                                        | `payroll:view`                                                                       |
| GET / POST          | `/api/employees/:id/salary-structure`; PUT / DELETE `…/:componentId`                                | `salaries:view` / `salaries:edit`                                                    |
| GET                 | `/api/employees/:id/payroll` (payroll history)                                                      | `payroll:view`                                                                       |

## Planned

projects, tasks, products, suppliers, purchases, inventory, reports. See `MASTER-ERP-BUILD-PLAN.md`.
