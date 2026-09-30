-- Phase 12: inventory and purchasing rules the database enforces (see docs/inventory.md).

ALTER TABLE "products"
  ADD CONSTRAINT "products_prices_not_negative" CHECK ("purchase_price" >= 0 AND "selling_price" >= 0),
  ADD CONSTRAINT "products_minimum_stock_not_negative" CHECK ("minimum_stock" >= 0);

-- Stock movements: never zero; the sign follows the type; transfers and receipts carry their link.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_not_zero" CHECK ("quantity" <> 0),
  ADD CONSTRAINT "stock_movements_sign_matches_type" CHECK (
    ("type" IN ('STOCK_IN', 'TRANSFER_IN', 'GOODS_RECEIPT') AND "quantity" > 0)
    OR ("type" IN ('STOCK_OUT', 'TRANSFER_OUT') AND "quantity" < 0)
    OR "type" = 'ADJUSTMENT'),
  ADD CONSTRAINT "stock_movements_transfer_link" CHECK (("type" IN ('TRANSFER_IN', 'TRANSFER_OUT')) = ("transfer_id" IS NOT NULL)),
  ADD CONSTRAINT "stock_movements_receipt_link" CHECK (("type" = 'GOODS_RECEIPT') = ("goods_receipt_id" IS NOT NULL)),
  ADD CONSTRAINT "stock_movements_unit_cost_not_negative" CHECK ("unit_cost" IS NULL OR "unit_cost" >= 0);

-- The inventory ledger is append-only: a mistake is corrected with a new movement (e.g. an adjustment).
CREATE FUNCTION stock_movements_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Stock movements cannot be changed or deleted; record a correcting movement instead'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movements_append_only();

-- Stock of a product in a warehouse (the sum of its movements) can never go below zero.
CREATE FUNCTION stock_movements_no_negative_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  on_hand NUMERIC;
BEGIN
  SELECT COALESCE(SUM("quantity"), 0) INTO on_hand FROM "stock_movements"
   WHERE "company_id" = NEW."company_id" AND "product_id" = NEW."product_id" AND "warehouse_id" = NEW."warehouse_id";
  IF on_hand < 0 THEN
    RAISE EXCEPTION 'Not enough stock: this movement would leave % in the warehouse', on_hand
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER stock_movements_no_negative_stock
  AFTER INSERT ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movements_no_negative_stock();

ALTER TABLE "purchase_request_items"
  ADD CONSTRAINT "purchase_request_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "purchase_request_items_price_not_negative" CHECK ("estimated_unit_price" IS NULL OR "estimated_unit_price" >= 0);

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_total_not_negative" CHECK ("total" >= 0),
  ADD CONSTRAINT "purchase_orders_dates_ordered" CHECK ("expected_date" IS NULL OR "expected_date" >= "order_date"),
  ADD CONSTRAINT "purchase_orders_cancelled_at_matches_status" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL));

ALTER TABLE "purchase_order_items"
  ADD CONSTRAINT "purchase_order_items_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "purchase_order_items_amounts_not_negative" CHECK ("unit_price" >= 0 AND "line_total" >= 0);

ALTER TABLE "goods_receipt_items"
  ADD CONSTRAINT "goods_receipt_items_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "supplier_invoices"
  ADD CONSTRAINT "supplier_invoices_amounts_not_negative" CHECK ("subtotal" >= 0 AND "tax_amount" >= 0),
  ADD CONSTRAINT "supplier_invoices_total_adds_up" CHECK ("total" = "subtotal" + "tax_amount"),
  ADD CONSTRAINT "supplier_invoices_paid_within_total" CHECK ("amount_paid" >= 0 AND "amount_paid" <= "total"),
  ADD CONSTRAINT "supplier_invoices_dates_ordered" CHECK ("due_date" IS NULL OR "due_date" >= "invoice_date"),
  ADD CONSTRAINT "supplier_invoices_cancelled_at_matches_status" CHECK (("status" = 'CANCELLED') = ("cancelled_at" IS NOT NULL)),
  ADD CONSTRAINT "supplier_invoices_cancelled_unpaid" CHECK ("status" <> 'CANCELLED' OR "amount_paid" = 0);

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_amount_positive" CHECK ("amount" > 0);
