# Audit logs (phase 13)

The audit log is the company's permanent record of **who did what, when and from where**. It is written by the
server in the same transaction as the change it describes, and nobody can change or delete it.

## What is recorded

Every important action in every module, as `area.action`:

| Kind                    | Examples                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sign-in and security    | `auth.login`, `auth.logout`, `auth.login_failed`, `auth.account_locked`, `auth.password_changed`, `auth.session_revoked` |
| Create                  | `customer.create`, `invoice.create`, `employee.create`, `product.create`, `task.create`, …                               |
| Update                  | `customer.update`, `invoice.update`, `task.status`, `employee.status_change`, `setting.update`, `user.role_change`, …    |
| Delete                  | `customer.delete`, `invoice.delete`, `product.delete`, `task.delete`, `user.remove`, …                                   |
| Approve / reject        | `expense.approve` / `.reject`, `leave.approve` / `.reject`, `purchase_request.approve` / `.reject`, `payroll.approve`    |
| Payments                | `payment.record`, `payment.void`, `invoice.payment_recorded`, `supplier_invoice.payment`, `expense.pay`, `payroll.pay`   |
| Invoice changes         | `invoice.create`, `invoice.update`, `invoice.mark_sent`, `invoice.send`, `invoice.cancel`, `invoice.delete`              |
| Viewing restricted data | `employee.bank_reveal` (full bank numbers shown), `audit_log.export`                                                     |

Each entry has:

| Field                  | Meaning                                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| User (`actor`)         | Who did it (empty for system events, e.g. a failed sign-in with an unknown email)                         |
| Action                 | `area.action`, shown as "Customers: Create"                                                               |
| Entity, entity ID      | The record type and id (`Invoice`, `0190…`)                                                               |
| Timestamp              | `created_at`, stored in UTC, shown in the company's time zone                                             |
| Company                | `company_id` — every entry belongs to one company (account-level events without a company: see below)     |
| Before / after         | Snapshot of the record before and after the change (restricted data is left out — see `docs/hr.md`)       |
| Details                | Extra context (`metadata`), e.g. the reason for a cancellation or the filters of an export                |
| IP address, user agent | From the request (`x-forwarded-for` / `x-real-ip`, `user-agent`), recorded automatically for every action |

**Sign-in and sign-out** are recorded in the company the user signs in to (their default company) and in the
company that was active when they signed out, so they appear in that company's log.

## Viewing and searching

`/audit-logs` (permission `audit-logs:view`; Super Admin and Admin by default):

- **Search** across action, record type, record ID, IP address and the user's name or email.
- **Filters:** area (customers, invoices, sign-in…), record type, user, and a from/to date range (in the company's
  time zone). Filters live in the URL, so a filtered view can be bookmarked or shared.
- Click an entry for the **detail page**: user, time, IP, user agent, and the before / after / details JSON.
- **Export CSV** (permission `audit-logs:export`): the filtered entries, newest first, up to 5,000 rows. Cells are
  escaped, and values starting with `=`, `+`, `-` or `@` are defused so spreadsheets don't run them as formulas.
  The export itself is recorded (`audit_log.export`).

API: `GET /api/audit-logs`, `GET /api/audit-logs/:id`, `GET /api/audit-logs/export` (see `docs/api.md`). There is
no API to create, change or delete entries.

## Nobody can change it

- **No code path:** the repository has no update or delete function, and the API routes only allow GET (anything
  else gets 405).
- **The database refuses it:** trigger `audit_logs_append_only` rejects every `UPDATE` and `DELETE` on
  `audit_logs`, whoever runs it — including someone with direct database access through the app's account. The only
  allowed change is PostgreSQL clearing `actor_id` when a user account is deleted (the entry stays, "System" is shown).
- Companies with audit history can't be deleted (`ON DELETE RESTRICT`); they are archived.
- Permissions: there is no "edit audit logs" permission. `audit-logs:view` and `audit-logs:export` are read-only.

## Tenant isolation

Every query is scoped by the current company. Another company's entry id is "not found". Tested in
`tests/integration/notifications.test.ts` ("audit log").

## Writing entries (for developers)

Call `writeAuditLog(ctx, { action, entityType, entityId, before, after, metadata }, tx)` from
`@/server/services/audit.service` inside the transaction of the change. The company, user, IP address and user agent
come from `ctx` (set by `requirePermission` / `authorizePage` from the request), never from the request body. Use an
existing area prefix (`src/lib/audit/labels.ts` has the readable names) and a short verb.

## Limitations

- Account-level events of users who belong to no company (e.g. a failed sign-in for an unknown email, registering)
  have no company and are not shown in any company's log.
- Reading data is not logged, except restricted data (bank details) and exports.
- Entries are kept forever; there is no retention policy or archive yet.
- An attacker with database **owner** rights could still drop the trigger. Shipping the log to an external,
  write-once store is a phase 16 hardening option.
