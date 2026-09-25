# Permissions

Role-based access control. **Code defines the catalogue; the database stores who has what.**

## Model

```
permissions (global)  ◄── role_permissions (company_id) ──►  roles (company_id)  ◄── memberships (company_id) ──► users
```

- A **permission** is a key `module:action`, e.g. `invoices:create`.
  Modules and actions are listed in `src/lib/permissions/index.ts`; actions are
  `read`, `create`, `update`, `delete`, `approve`.
- The seed syncs that list into the `permissions` table (currently 21 modules × 5 actions = 105 keys).
- **Roles belong to one company.** Their permissions are rows in `role_permissions`.
- A user's **membership** in a company points to exactly one role in that same company. The database
  enforces "same company" with composite foreign keys — a role of company A can never be attached to a
  membership or role permission of company B.

## Default roles

Created for every new company (`is_system = true`). Defined in code with wildcards, stored expanded
to concrete keys:

| Role       | Definition                                                           |
| ---------- | -------------------------------------------------------------------- |
| Owner      | `*` — every permission                                               |
| Admin      | Every module `*` except `settings`                                   |
| Accountant | Invoices, payments, expenses, accounting; read reports & customers   |
| HR Manager | Employees, attendance, leaves, payroll; read reports                 |
| Sales Rep  | Customers, leads; read/create invoices; read products                |
| Employee   | Create attendance & leave requests; read/update tasks; read projects |

Custom roles and role editing arrive in phase 03.

## Enforcing (server-side only)

```ts
const ctx = await requirePermission("invoices", "create"); // in a route handler or server action
```

- Throws `UnauthenticatedError` (401) when signed out.
- Throws `ForbiddenError` (403) when the user has no active membership in an active company, or the
  role lacks the permission.
- Returns the `TenantContext` (`userId`, `companyId`, `roleId`, `permissions`) to pass to services.

The UI hides navigation items the user cannot read (`allowedNavHrefs`), but that is convenience only —
the server check above is what protects data.

## Adding a permission

1. Add the module to `MODULES` (or an action to `ACTIONS`) in `src/lib/permissions/index.ts`.
2. Update `DEFAULT_ROLES` if built-in roles should get it.
3. Run `npm run db:seed` (and deploy) — the catalogue and the built-in roles of every seeded company are refreshed.
