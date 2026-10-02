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

## Projects and tasks (phase 11)

Rules and visibility: `docs/projects.md`. Records outside the caller's scope are 404.

| Method             | Path                                                                                                  | Permission                          |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| GET / POST         | `/api/projects?search=&status=&customerId=&page=` / create                                            | `projects:view` / `projects:create` |
| GET / PUT / DELETE | `/api/projects/:id` (GET includes progress; DELETE 409 if it has tasks)                               | `projects:view` / `edit` / `delete` |
| GET                | `/api/projects/report`                                                                                | `projects:view`                     |
| GET / POST         | `/api/tasks?search=&projectId=&assigneeId=&status=&priority=&due=overdue\|soon&mine=1&page=` / create | `tasks:view` / `tasks:create`       |
| GET                | `/api/tasks/board?projectId=&mine=1`                                                                  | `tasks:view`                        |
| GET / PUT / DELETE | `/api/tasks/:id` (PUT: task managers only)                                                            | `tasks:view` / `edit` / `delete`    |
| POST               | `/api/tasks/:id/status` `{ status }` (409 if moved meanwhile or the project is closed)                | `tasks:edit`                        |
| POST               | `/api/tasks/:id/assign` `{ assigneeId }` (empty = unassign; task managers only)                       | `tasks:edit`                        |
| GET / POST         | `/api/tasks/:id/attachments` (multipart `file`)                                                       | `tasks:view` / `tasks:edit`         |
| GET / DELETE       | `/api/tasks/:id/attachments/:attachmentId` (download / delete own, or any as task manager)            | `tasks:view` / `tasks:edit`         |

## Inventory and purchasing (phase 12)

Rules: `docs/inventory.md`. Stock is never written directly — only through `POST /api/inventory` and goods receipts.

| Method                         | Path                                                                                                                | Permission                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| GET / POST                     | `/api/products?search=&categoryId=&warehouseId=&stock=low\|out&inactive=1` / create                                 | `products:view` / `products:create`                                            |
| GET / PUT / DELETE             | `/api/products/:id` (GET: stock per warehouse, on order, value; DELETE 409 while in stock)                          | `products:view` / `edit` / `delete`                                            |
| GET                            | `/api/products/low-stock`                                                                                           | `products:view`                                                                |
| GET / POST, PUT / DELETE       | `/api/products/categories`, `/api/products/categories/:id`                                                          | `products:view` / `create`, `edit` / `delete`                                  |
| GET / POST                     | `/api/inventory?productId=&warehouseId=&type=` (history) / `{ operation: IN\|OUT\|ADJUST\|TRANSFER, … }`            | `inventory:view` / `inventory:create` (ADJUST: `inventory:edit`)               |
| GET / POST, PUT / DELETE       | `/api/inventory/warehouses`, `/api/inventory/warehouses/:id`                                                        | view: inventory, products or purchases; `inventory:create` / `edit` / `delete` |
| GET                            | `/api/inventory/valuation`                                                                                          | `products:view`                                                                |
| GET / POST, GET / PUT / DELETE | `/api/suppliers`, `/api/suppliers/:id` (GET includes products, orders, bills, payments)                             | `suppliers:*`                                                                  |
| GET / POST                     | `/api/purchases/requests` / create                                                                                  | `purchases:view` (own requests with `purchases:create`) / `purchases:create`   |
| GET, POST                      | `/api/purchases/requests/:id`, `/api/purchases/requests/:id/decision` `{ decision: approve\|reject\|cancel, note }` | approve / reject / requester or delete (never your own approval)               |
| GET / POST                     | `/api/purchases/orders` / create (Draft; `requestId` of an approved request)                                        | `purchases:view` / `purchases:create`                                          |
| GET / PUT                      | `/api/purchases/orders/:id` (received / remaining per line) / edit a draft                                          | `purchases:view` / `purchases:edit`                                            |
| POST                           | `/api/purchases/orders/:id/status` `{ action: order }` or `{ action: cancel, reason }`                              | `purchases:edit` / `purchases:delete`                                          |
| POST                           | `/api/purchases/orders/:id/receipts` `{ receivedDate, note?, items: [{ orderItemId, quantity }] }`                  | `inventory:create`                                                             |
| GET / POST                     | `/api/purchases/bills` / record (posts B1)                                                                          | `purchases:view` / `accounting:create`                                         |
| GET, POST                      | `/api/purchases/bills/:id`, `/api/purchases/bills/:id/cancel` `{ reason }` (B2)                                     | `purchases:view`, `accounting:edit`                                            |
| GET / POST                     | `/api/purchases/payments` / pay `{ invoiceId, amount, method, paymentDate, … }` (B3)                                | `purchases:view` / `accounting:create`                                         |
| POST                           | `/api/purchases/payments/:id/void` `{ reason }` (B4)                                                                | `accounting:edit`                                                              |

## Notifications and audit logs (phase 13)

Rules: `docs/notifications.md`, `docs/audit-logs.md`. Notifications are always the signed-in user's own.

| Method    | Path                                                                                           | Permission                         |
| --------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- |
| GET       | `/api/notifications?status=unread&type=&page=&pageSize=`                                       | signed-in member                   |
| PATCH     | `/api/notifications` `{ ids: [...], read: true\|false }` or `{ all: true }`                    | signed-in member                   |
| GET       | `/api/notifications/recent` (latest items + unread count, for the bell)                        | signed-in member                   |
| GET / PUT | `/api/notifications/preferences` / `{ preferences: [{ type, inApp, email }] }`                 | signed-in member                   |
| GET       | `/api/audit-logs?search=&action=&entityType=&actorId=&from=&to=&page=&pageSize=`               | `audit-logs:view`                  |
| GET       | `/api/audit-logs/:id`                                                                          | `audit-logs:view`                  |
| GET       | `/api/audit-logs/export?…same filters` (CSV, max 5,000 rows; audited)                          | `audit-logs:export`                |
| POST      | `/api/cron/notifications` with `Authorization: Bearer <CRON_SECRET>` (404 when not configured) | scheduler secret (no user session) |

Audit routes are read-only: other methods get 405.

## Planned

reports and exports. See `MASTER-ERP-BUILD-PLAN.md`.
