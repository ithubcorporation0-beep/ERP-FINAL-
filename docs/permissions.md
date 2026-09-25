# Permissions

Role-based access control, defined in `src/lib/permissions`.

- A permission is a string `module:action`, e.g. `invoices:create`.
- Actions: `read`, `create`, `update`, `delete`, `approve`.
- Wildcards: `module:*` grants every action on a module; `*` grants everything.
- Roles belong to an organization and store a `permissions` string array.
  A user's role is set on their `Membership` in that organization.

## Default roles (seeded)

| Role        | Access |
|-------------|--------|
| Owner       | `*` |
| Admin       | Everything except settings |
| Accountant  | Invoices, payments, expenses, accounting; read reports & customers |
| HR Manager  | Employees, attendance, leaves, payroll; read reports |
| Sales Rep   | Customers, leads; read/create invoices; read products |
| Employee    | Own attendance & leave requests; read/update tasks; read projects |

## Enforcing

```ts
const ctx = await requirePermission("invoices", "create");
```

Throws `HttpError(401)` when signed out and `HttpError(403)` when the permission is missing.
