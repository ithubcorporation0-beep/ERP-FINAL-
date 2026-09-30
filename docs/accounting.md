# Accounting (phase 08)

This page says exactly which accounting rules the app implements, and which it does **not**. The figures are only as
correct as these rules: the app is a double-entry bookkeeping tool, not certified accounting software, and it
does not replace an accountant.

## Double-entry ledger

- Every financial event is a **journal entry** (`journal_entries`, shown as "Transactions", `JE-0001`) with at
  least two **lines** (`journal_lines`). Each line debits **or** credits one account.
- **Σ debits = Σ credits** for every entry. This is enforced three times:
  1. `checkEntry()` in `src/lib/accounting.ts` (exact BigInt arithmetic) before anything is written;
  2. a CHECK constraint `journal_lines_one_side` (one side > 0, the other 0, none negative);
  3. a deferred constraint trigger `journal_lines_balanced` that refuses to commit an unbalanced entry, even from
     raw SQL.
- Posted entries are **immutable**. A mistake is corrected with a **reversing entry** (debits and credits swapped,
  `reversal_of_id` points at the original). Only manual entries can be reversed by hand; automatic postings are
  corrected from their source (cancel the invoice, void the payment).
- Automatic postings carry a unique `posting_key` (e.g. `invoice:<id>:issue`), so the same event can never be
  posted twice — retries and `syncAllCompanies()` (run by the seed) are idempotent.
- Transaction types (Income, Expense, Payment, Purchase, Sales) are labels for filtering and the cash-flow report;
  they don't change how an entry is posted.

## Chart of accounts

Every company starts with these accounts (`DEFAULT_ACCOUNTS` in `src/config/accounting.ts`). System accounts are
used by the automatic postings: they can be renamed but not deleted, and their type can't change. Companies can
add their own accounts; an account with transactions can't be deleted (deactivate it instead).

| Code      | Account                                                          | Type      | Normal side |
| --------- | ---------------------------------------------------------------- | --------- | ----------- |
| 1000      | Cash                                                             | Asset     | Debit       |
| 1010      | Bank                                                             | Asset     | Debit       |
| 1100      | Accounts Receivable (AR)                                         | Asset     | Debit       |
| 1500      | Other Assets                                                     | Asset     | Debit       |
| 2000      | Accounts Payable (AP)                                            | Liability | Credit      |
| 2100      | Tax Payable                                                      | Liability | Credit      |
| 2500      | Other Liabilities                                                | Liability | Credit      |
| 3000      | Owner's Equity                                                   | Equity    | Credit      |
| 4000      | Sales Revenue                                                    | Revenue   | Credit      |
| 4900      | Other Income                                                     | Revenue   | Credit      |
| 5000      | Purchases (supplier invoices, phase 12)                          | Expense   | Debit       |
| 6000–6080 | One expense account per expense category (Rent … Other Expenses) | Expense   | Debit       |

Balances are shown on the account's normal side (`normalBalance()`); a negative balance means the account is on
its unusual side (e.g. an overdrawn bank).

## Posting rules

| Rule | Event                                  | Debit                                      | Credit                                                 | Date             |
| ---- | -------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | ---------------- |
| S1   | Invoice issued (sent / marked as sent) | AR — invoice total                         | Sales Revenue — subtotal − discount; Tax Payable — tax | Invoice date     |
| S2   | Issued invoice cancelled               | Reversal of S1                             |                                                        | Cancellation day |
| S3   | Payment received                       | Cash (method Cash) or Bank (other methods) | AR                                                     | Payment date     |
| S4   | Payment voided                         | Reversal of S3                             |                                                        | Void day         |
| E1   | Expense approved                       | Expense account of its category            | Cash / Bank by payment method, or AP if "Not paid yet" | Expense date     |
| E2   | Unpaid expense marked as paid          | AP                                         | Cash or Bank                                           | Payment date     |

Draft invoices, pending and rejected expenses are not posted. Zero-total invoices are not posted. Each posting is
written in the **same database transaction** as the change that causes it, together with the audit log.

## Expenses

Fields: number (`EXP-0001`), category, amount, date (not in the future), vendor, payment method, description,
receipt (PDF/image, 10 MB, stored under `companies/<id>/expenses/<id>/`), employee, approval status.

Workflow: **Pending → Approved** (posted, E1) or **Rejected** (reason required). The submitter can correct a
rejected expense, which sends it back to Pending. Approved expenses can't be edited or deleted. Who may do what is
in `docs/permissions.md` → Finance.

## Reports

| Report              | Source                                      | Definition                                                                                                                                                    |
| ------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profit & Loss       | Ledger                                      | Revenue and expense account balances for entries dated in the period; net profit = revenue − expenses                                                         |
| Balance Sheet       | Ledger                                      | All balances up to the end of the chosen day; unclosed profit is shown as "Current earnings" inside equity; badge shows whether assets = liabilities + equity |
| Cash Flow           | Ledger (Cash and Bank accounts)             | Opening balance, money in (debits) and out (credits) by transaction type, closing balance                                                                     |
| Accounts Receivable | Invoices (sub-ledger) + AR account          | Open invoice balances aged by due date (current, 1–30, 31–60, 61–90, 90+ days overdue), reconciled with AR                                                    |
| Accounts Payable    | Expenses and supplier invoices + AP account | Approved unpaid expenses aged from the expense date, reconciled with AP                                                                                       |
| Expense Report      | Expenses                                    | Approved expenses by category (exact share %) and top vendors                                                                                                 |
| Revenue Report      | Invoices and payments                       | Issued invoices (incl. tax) by month and customer; cash received by payment method                                                                            |

Periods use the company's time zone and fiscal year; all sums use exact decimal arithmetic. Every report is also
available as JSON at `/api/accounting/reports/<slug>`.

## Limitations (what is not implemented)

- **Accrual basis at the invoice date** only; no cash-basis P&L.
- **Tax is simplified:** invoice tax goes to one Tax Payable account; no tax returns, input tax on expenses, or
  multiple tax jurisdictions.
- **Accounts payable is simplified:** expenses marked "Not paid yet" (due immediately) and supplier invoices
  (phase 12, aged from their due date, partial payments allowed); no payment terms or supplier credit notes.
- **Purchases are expensed when billed** (periodic method, account 5000 Purchases); stock isn't capitalised and
  there is no cost of goods sold — see `docs/inventory.md` (rules B1–B4).
- **Cash flow is a simplified direct method:** no operating / investing / financing classification.
- **No period closing:** no closing entries, locked periods or retained-earnings roll-forward; profit stays in
  "Current earnings".
- **Single currency:** the company's base currency; no exchange rates or revaluation.
- **No bank reconciliation, depreciation, accruals/prepayments, budgets, or trial-balance export** yet.
- Payroll (phase 10) posts salaries, tax and deductions withheld and advances with rules P1–P3 — see
  `docs/payroll.md`. Paying withheld tax to the authorities is a manual transaction.
- Manual entries can post to any active account, so a manual entry to AR or AP makes the sub-ledger
  reconciliation show a difference — the reports say so instead of hiding it.
