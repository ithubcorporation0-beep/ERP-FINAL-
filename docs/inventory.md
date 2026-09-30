# Inventory, suppliers and purchasing (phase 12)

What the inventory and purchasing modules do, the exact rules they apply, and what they do **not** do.

## The one rule: stock comes from transactions

There is **no "current stock" field** anywhere. The stock of a product in a warehouse is the **sum of its stock
movements** (`stock_movements`), and the stock of a product is that sum over all warehouses.

- The only way to change stock is to record a movement: stock in, stock out, adjustment, transfer, or goods received
  from a purchase order. The product form has no stock field.
- Movements are **append-only**: the database refuses to change or delete one (trigger
  `stock_movements_append_only`). A mistake is corrected with a new movement (e.g. an adjustment), so the history
  always explains the number.
- Stock can **never go negative**: the service checks under a row lock on the product (two simultaneous stock-outs
  can't both use the same stock), and the database checks again after every insert (trigger
  `stock_movements_no_negative_stock`).
- Quantities are exact decimals (up to 3 places, e.g. 2.5 kg), calculated with BigInt — never floating point
  (`src/lib/inventory.ts`, unit-tested in `tests/unit/inventory.test.ts`).
- The sign of a movement matches its type (CHECK `stock_movements_sign_matches_type`): stock in, transfer in and goods
  received are positive; stock out and transfer out negative; adjustments either.

## Products

`PRD-0001`. Fields: SKU (unique per company; kept by deleted products), name, category, brand, unit (pcs, kg, box…),
purchase price, selling price, minimum stock, supplier (preferred), default warehouse, description, active.

- **Current stock** is shown everywhere a product is listed, calculated from movements, with its status: _Out of
  stock_ (≤ 0), _Low stock_ (≤ minimum), _In stock_.
- A product with stock can't be deleted — record a stock out or adjustment to zero first, or deactivate it. Inactive
  products can't be used in stock operations or purchases.

## Stock operations

`/inventory/movements/new` (or "Record stock movement" on a product):

| Operation      | Records                                                                                                | Permission         |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------ |
| Stock in       | `STOCK_IN` +quantity, with a unit cost (default: purchase price)                                       | `inventory:create` |
| Stock out      | `STOCK_OUT` −quantity; refused if more than is in the warehouse                                        | `inventory:create` |
| Adjustment     | You enter the **counted** quantity; `ADJUSTMENT` of (counted − on hand); a reason is required          | `inventory:edit`   |
| Transfer       | `TRANSFER_OUT` from one warehouse and `TRANSFER_IN` to another, sharing a transfer id; total unchanged | `inventory:create` |
| Goods received | `GOODS_RECEIPT` +quantity at the order price, from a purchase order (below)                            | `inventory:create` |

Every operation is in the product's history (audit log) and in **inventory history** (`/inventory/movements`),
filterable by product, warehouse and type, searchable by product, SKU, reference and `STK-` number.

## Warehouses and categories

Stock is kept per **warehouse** (e.g. Main store, Shop). A warehouse with stock history, products or orders can't be
deleted — deactivate it. **Categories** group products; only unused categories can be deleted.

## Low-stock detection

A product is **low** when it is active, has a minimum stock above 0, and its total stock (all warehouses) is at or
below that minimum (this includes out of stock). Products with minimum 0 never alert — set a minimum to be warned.

Low stock shows as: the dashboard figure "Low stock items", a banner on the products page with a "Show low-stock
products" filter (`?stock=low`; also `?stock=out`), a badge with the quantity to reorder on the product page (plus a
"Request more" shortcut), the low-stock table on `/inventory/reports`, and `GET /api/products/low-stock`.
Sending notifications or emails about it is phase 13.

## Suppliers

`SUP-0001`. Fields: name, company, phone, email, address, tax information, notes, active. The supplier page shows
the supplier's **products** (with stock), **purchase history** (orders), invoices and **payment history**, each only
with the matching view permission. A supplier with orders or bills can't be deleted — deactivate it.

## Purchase workflow

```
Purchase Request → Purchase Order → Goods Received → Supplier Invoice → Payment
     (PR-0001)         (PO-0001)        (GRN-0001)       (BILL-0001)      (SPAY-0001)
```

| Step                 | What happens                                                                                                                                                                                                                                                                                                                                                  | Who                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Purchase request** | Someone asks for products (quantities, estimated prices, reason, needed-by date). Pending → Approved / Rejected (reason required) → Ordered; can be cancelled before it's ordered. **Nobody approves their own request.**                                                                                                                                     | create `purchases:create`; approve `purchases:approve`; reject `purchases:reject`; cancel: the requester or `purchases:delete` |
| **Purchase order**   | Supplier, receiving warehouse, lines (product, quantity, price → exact line totals and total). Created as Draft (optionally from an approved request, which becomes Ordered — one order per request), edited while Draft, then **placed** (Ordered). Draft or Ordered orders with nothing received or billed can be cancelled (its request is cancelled too). | create `purchases:create`; edit / place `purchases:edit`; cancel `purchases:delete`                                            |
| **Goods received**   | Quantities received per line, never more than what is still open. Creates a GRN and one `GOODS_RECEIPT` stock movement per line (at the order price) in the same transaction. The order becomes Partly received / Received. The order row is locked, so two receipts can't over-receive.                                                                      | `inventory:create`                                                                                                             |
| **Supplier invoice** | The supplier's bill: their invoice number, dates, amount before tax, tax, total (= amount + tax, a database CHECK). Optionally linked to a placed order of the same supplier; the bills of an order can't add up to more than its total. Posts **B1**. An unpaid bill can be cancelled (reason; posts **B2**).                                                | record `accounting:create` (+ `purchases:view`); cancel `accounting:edit`                                                      |
| **Payment**          | Pays all or part of the open balance (never more). The bill becomes Partly paid / Paid; the paid amount is recomputed from the valid payments under a lock. Posts **B3**. A payment can be voided (reason; posts **B4**; reopens the balance) — never deleted.                                                                                                | pay `accounting:create`; void `accounting:edit`                                                                                |

## Accounting (ledger rules)

| Rule | Event                             | Debit                              | Credit                     |
| ---- | --------------------------------- | ---------------------------------- | -------------------------- |
| B1   | Supplier invoice recorded         | Purchases (5000) — total incl. tax | Accounts Payable           |
| B2   | Unpaid supplier invoice cancelled | Reversal of B1                     |                            |
| B3   | Supplier paid                     | Accounts Payable                   | Cash (method Cash) or Bank |
| B4   | Supplier payment voided           | Reversal of B3                     |                            |

Posting keys (`supplier-invoice:<id>`, `supplier-payment:<id>`) make every posting idempotent. The **Accounts
Payable report** now lists open supplier invoices (aged from their due date) next to unpaid expenses and still
reconciles with the AP account.

**Periodic method:** purchases are expensed when billed (account 5000 Purchases). Receiving goods and stock
movements don't post to the ledger, and the inventory value is **not** on the balance sheet; the stock valuation on
`/inventory/reports` (stock × current purchase price) is a management figure. Input tax on bills is not reclaimed
separately (it is part of the Purchases expense).

## Security and isolation

Every page, API route and service checks permissions on the server; every query is scoped by company, and all new
tables carry `company_id` with composite foreign keys (a movement can only point at a product and warehouse of the
same company). Other companies' records are 404. The new built-in role **Inventory Manager** has products,
inventory, suppliers and purchasing (without approving purchases or posting to the ledger).

## Not implemented

- Selling from stock automatically (invoices don't reduce stock yet — record a stock out), stock reservations.
- Perpetual inventory accounting (inventory asset, cost of goods sold), FIFO / weighted-average costing, landed costs.
- Serial / batch / expiry tracking, units of measure conversion, barcodes, product variants, bundles.
- Reversing a goods receipt (record a stock out or adjustment instead); returns to suppliers; supplier credit notes.
- Partial billing by line (bills are amounts against an order), supplier payment terms, multi-currency purchasing.
- Low-stock notifications / emails and automatic reorder (phase 13 adds notifications).
