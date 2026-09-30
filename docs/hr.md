# HR: employees, attendance and leave (phase 09)

This page states exactly what the HR module does, the rules it applies, and what it does **not** do yet.

## Employees

| Field                          | Notes                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Employee ID                    | `EMP-0001`, per company, issued on save and never reused                                                      |
| Name, email, phone             |                                                                                                               |
| Photo                          | PNG, JPEG or WebP up to 2 MB, type checked from the file's bytes; shown only to people who can view employees |
| CNIC / employee identification | National ID (e.g. CNIC `35202-1234567-1`) or another ID; letters, digits, spaces, dashes                      |
| Department, position           | Departments are managed on `/hr/departments`                                                                  |
| Joining date                   |                                                                                                               |
| Salary, bank details           | Separate, restricted table — see [Salary and bank security](#salary-and-bank-security)                        |
| Emergency contact              | Name, relationship, phone                                                                                     |
| Documents                      | Contracts, ID copies, certificates (PDF, images, Office files, 10 MB); always downloaded                      |
| Employment status              | Probation, Active, On notice, Suspended, Resigned, Terminated                                                 |
| Login                          | Optional link to a member's account — needed for self-service check-in and leave requests                     |

- **Status management:** "Change status" on the profile. Resigned / terminated need the last working day
  (not before the joining date — also a database CHECK); going back to an active status clears it. Every change
  is audited with its note and shown in the profile history.
- **Delete** is a soft delete: the record disappears from lists, the login link is released, attendance and
  leave history stay. Prefer changing the status.
- A login can be linked to one employee record per company.
- **Departments** can be renamed and deactivated; only a department nobody belongs to can be deleted.

## Salary and bank security

Salary, bank name, account title, account number and IBAN are restricted personal data:

1. **Separate table** (`employee_compensations`). Employee queries never select it, so profile pages, lists,
   exports and APIs can't leak it by accident.
2. **Own permissions**: `salaries:view` (see salary and masked bank details) and `salaries:edit` (change them).
   Built-in: HR Manager, Admin, Super Admin. Managers and Accountants can see employees but **not** pay.
   Enforced in `compensation.service.ts` and the API route — the page doesn't even load the data otherwise.
3. **Encryption at rest**: account number and IBAN are encrypted with AES-256-GCM (`src/lib/crypto`), a random
   IV per value, and the company + employee + field as authenticated data (a value copied to another row fails
   to decrypt). Only the last 4 characters are kept in clear for masking (`•••• 8901`). The key is
   `DATA_ENCRYPTION_KEY` (32 random bytes, base64) — **required in production**. Losing the key makes the stored
   numbers unreadable; back it up with your other secrets. Values carry a `v1:` prefix so the key can be rotated
   later (re-encrypt with a new version).
4. **Reveal is explicit and audited**: full numbers are only returned by "Show full numbers" /
   `GET …/compensation?reveal=1`, which writes an `employee.bank_reveal` audit event every time.
5. **No values in audit logs**: changes are audited as "Changed: salary, account number" only; the audit
   serializer also redacts `salary`, `accountNumber*` and `iban*` keys everywhere.
6. Responses carrying pay are sent with `Cache-Control: private, no-store`.

Salary itself is not encrypted: payroll must sum it in the database; it is protected by 1, 2 and 5. Salary
structures and payroll are described in `docs/payroll.md`.

## Attendance

**Work schedule** (Settings → Work schedule, `settings:manage`): working days, start, end, late grace minutes,
half-day threshold. Defaults: Monday–Friday, 09:00–17:00, 10 minutes grace, half day under 240 minutes. Times are
in the company time zone. Overnight shifts are not supported (end must be after start).

**Check in / check out** (`attendance:create`): the employee's own linked record, once per day. The **server's
clock** is used — the browser never sends a time, so it can't be faked. A second check-in the same day is refused
(also by a unique database key). Check-out applies to today's record only.

**Rules** (`src/lib/attendance.ts`, unit-tested):

| Outcome         | Rule                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Late            | Check-in more than _grace_ minutes after the start; late minutes are counted from the start                          |
| Early departure | Check-out before the end on the same day; early minutes are recorded                                                 |
| Half day        | Checked out after working fewer than the half-day threshold (wins over "late" as the day status)                     |
| Present         | Any day with a check-in (late and half days are part of present in totals)                                           |
| On leave        | A working day without a record, covered by an **approved** leave request                                             |
| Absent          | A working day without a record or leave, once it is over (past date, or today after the end); or marked absent by HR |
| Not checked in  | Today, before the end of the working day, without a record                                                           |

Only working days count, and only while the person is employed (joined, not past the exit date, not suspended).
A stored record wins over leave. Absences are **derived** when reports are read — no nightly job writes them.

**HR entries and corrections** (`attendance:edit`): enter a day for anyone (times or "absent"); correcting a day
the employee recorded themselves requires a note. `attendance:delete` removes a record. All audited.

**Attendance dashboard** (`/hr/attendance`, people with `attendance:edit`, `attendance:approve` or
`employees:view`): Present, Absent (not checked in and not on leave), Late, On leave, Total employees (probation,
active and on-notice staff) for today, plus each expected employee's status. **Report**
(`/hr/attendance/report`): per-employee working days, present, late, half days, early departures, absent, on
leave and hours worked for a period. The dashboard shows "Total employees" and an "Employee attendance" chart.

Everyone else sees only their own attendance.

## Leave

Fields: employee, leave type (Annual, Sick, Casual, Unpaid, Maternity, Paternity, Other), start and end date,
reason, attachment (e.g. a medical certificate), status (**Pending → Approved / Rejected**).

- **Request** (`leaves:create`): for yourself (your login must be linked to an employee record); HR
  (`leaves:edit`) may file for anyone. The number of **working days** is computed from the work schedule; a range
  without working days is refused. Requests may not overlap the employee's other pending or approved leave — checked
  while holding a row lock on the employee, so two simultaneous requests can't both pass.
- **Approve / reject** (`leaves:approve` / `leaves:reject` — Manager and HR Manager by default): pending requests
  only, a reason is required to reject, and **nobody can decide their own request**.
- **Cancel**: the employee's own pending request, or anyone's with `leaves:delete`.
- Approvers and HR see all requests; everyone else sees only their own. Approved leave shows as "On leave" in
  attendance.

## Not implemented (documented future features)

These are **not** implemented and nothing in the app pretends they are:

- **GPS / geofencing** for check-in (would record coordinates with consent and compare them with office
  locations).
- **Device and IP restrictions** (allow check-in only from registered devices or office networks).
- **Biometric integration** (fingerprint / face terminals pushing punches through an authenticated device API).
- Shifts, overnight shifts, rosters, overtime and flexible hours; public holiday calendars.
- Leave balances, entitlements, accruals and carry-over; half-day leave.
- Attendance correction requests from employees; approval of attendance (`attendance:approve` currently only
  grants visibility).
- Email / in-app notifications for leave decisions (notifications are phase 13).
- Bulk import of employees and attendance exports (reports and exports are phase 14).
- Encryption key rotation tooling.
