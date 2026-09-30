# Payroll (phase 10)

What the payroll module does, the exact rules it applies, and what it does **not** do. It calculates and records
pay from the amounts you set up; it does **not** compute statutory income tax, social security or labour-law
entitlements for any country — enter those as structure lines.

## The formula

```
Gross pay        = Basic Salary + Allowances + Bonus + Overtime
Total deductions = Deductions + Tax + Advances
Net Salary       = Basic Salary + Allowances + Bonus + Overtime − Deductions − Tax − Advances
```

- Implemented once, in `src/lib/payroll.ts` (`calculatePayroll`), shared by the server, the browser preview and the
  tests (`tests/unit/payroll.test.ts`).
- **Exact**: amounts are decimal strings calculated in integer cents with BigInt (`src/lib/money.ts`); no floating
  point, no rounding (every input has at most 2 decimals; more is refused, not rounded).
- Every component must be ≥ 0; a negative net is refused.
- The database checks the formula again on every stored payslip (`payroll_items_net_formula`), so no code path —
  not even raw SQL — can store a payslip whose net doesn't add up.

## Salary structures

Per employee, on the profile's **Salary & bank** tab (restricted: `salaries:view` / `salaries:edit`):

- **Basic salary** — the monthly salary stored with the bank details (encrypted bank numbers, see `docs/hr.md`).
- **Recurring lines** — allowances, deductions and tax, each with a name and monthly amount; lines can be
  deactivated. A preview shows the net before bonus, overtime and advances.

Tax is an amount you enter (e.g. from your tax table or advisor); the app does not calculate tax brackets.

## Payroll runs

One run per company and month (`PRL-0001`).

| Step        | Who (permission)                                            | What happens                                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process     | `payroll:create`                                            | One payslip per employee employed in the month (joined by its last day, not left before its first day, not suspended) **who has a basic salary**; others are listed as skipped. Structure lines are copied; outstanding advances are added. |
| Adjust      | `payroll:edit` (Draft only)                                 | Change basic, allowances, bonus, overtime, deductions, tax and a note per payslip (e.g. prorate a joiner, add a bonus). Net is recomputed; advances can't be typed.                                                                         |
| Recalculate | `payroll:edit` (Draft only)                                 | Rebuilds payslips from current structures, employees and advances; typed bonus, overtime and notes are kept.                                                                                                                                |
| Submit      | `payroll:edit`                                              | Draft → Waiting for approval (payslips locked).                                                                                                                                                                                             |
| Approve     | `payroll:approve`, **not the person who processed the run** | → Approved. Payslips are frozen — also by a database trigger.                                                                                                                                                                               |
| Send back   | `payroll:reject` (reason required)                          | Waiting for approval → Draft.                                                                                                                                                                                                               |
| Pay         | `payroll:view` **and** `accounting:create`                  | Approved → Paid: posted to the ledger, recovered advances marked, final.                                                                                                                                                                    |
| Cancel      | `payroll:delete` (reason required)                          | Draft, waiting or approved → Cancelled; the month can be processed again. Paid runs can't be cancelled.                                                                                                                                     |

The **pay date** must fall between the first day of the month and 31 days after its last day (catches typos).

**Joiners and leavers** are flagged ("joined or left this month") but the basic salary is **not prorated
automatically** — adjust it on the payslip.

### Duplicate protection

- One non-cancelled run per month: the service checks, and a unique key on `(company_id, active_period)` refuses a
  second run even for two simultaneous requests (a cancelled run clears `active_period`).
- One payslip per employee and run (unique key).
- Every change to a run takes a row lock on it and only applies from the expected status (a double-click or a
  second tab gets "changed meanwhile" instead of acting twice).
- Paying is idempotent: the ledger posting key `payroll:<id>:paid` can't be posted twice, and a paid run can't be
  paid again.
- Payslips of approved, paid or cancelled runs can't be changed (database trigger `payroll_items_frozen`).

## Salary advances

`ADV-0001`: money paid to an employee ahead of payroll (`payroll:create`), posted immediately. The next payroll
whose month ends on or after the advance date recovers it **in full**, oldest first, as long as the net stays
≥ 0; an advance that doesn't fit waits for the following month (advances are never split). When the run is paid
the advance becomes Recovered. An outstanding advance can be cancelled when the money was returned
(`payroll:delete`; the posting is reversed).

## Accounting (ledger rules)

| Rule | Event             | Debit                                   | Credit                                                                                         |
| ---- | ----------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| P1   | Advance paid      | Other Assets (receivable from employee) | Cash (method Cash) or Bank                                                                     |
| P2   | Advance cancelled | Reversal of P1                          |                                                                                                |
| P3   | Payroll paid      | Salaries expense — gross pay            | Tax Payable — tax · Other Liabilities — deductions · Other Assets — advances · Cash/Bank — net |

P3 balances because gross = tax + deductions + advances + net. Zero lines are left out. Paying the withheld tax
and deductions to the authorities is recorded as a manual transaction (not automated).

## Salary slips

A PDF per payslip (`/api/payroll/<run>/items/<item>/slip`): employer, employee (ID, position, department), period,
pay date, earnings (basic, each allowance, bonus, overtime), deductions (each deduction and tax line, advance
recovery), gross, total deductions and net. One-off changes beyond the structure show as an "adjustment" row.
Slips of draft runs say so; cancelled runs have none. Slips show the stored figures — they never change after
approval.

## Reports

`/payroll/reports` for approved and paid runs in a period: per month, per department and per employee — gross,
deductions, tax withheld, advances and net. The employee profile has a **Payroll** tab with that person's history
and slips.

## Security

- Salary data is visible only with `payroll:view` (runs, payslips, reports — HR Manager, Accountant, Admin) or
  `salaries:view` (structures). Managers and employees get 403 / "no access"; other companies get 404.
- Every page, API route and service checks permissions on the server; payroll API responses are `no-store`.
- **Audit**: who processed, recalculated, adjusted (which employee and which fields), submitted, approved, sent
  back, paid (with the journal entry) and cancelled — **without amounts**, so audit-log readers don't see pay.
  The amounts themselves are kept on the frozen payslips and in the ledger.

## Not implemented

- Statutory tax / social security calculation, tax tables, year-to-date tax, tax returns.
- Automatic proration for joiners / leavers; attendance- or leave-based pay (unpaid leave deductions).
- Overtime from hours × rate (overtime is entered as an amount).
- Partial advance recovery or instalment plans.
- Employee self-service payslips (employees see no payroll yet).
- Bank payment files, multi-currency payroll, off-cycle / bonus-only runs, payroll reversal after payment.
