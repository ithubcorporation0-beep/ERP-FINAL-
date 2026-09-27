-- Database-level guarantees for sales money (the service checks the same rules first; these catch any bug or
-- manual edit). Prisma does not model CHECK constraints, so they live only in this migration.

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_paid_in_range"
    CHECK ("amount_paid" >= 0 AND "amount_paid" <= "total");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_total_not_negative" CHECK ("total" >= 0);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_due_after_issue" CHECK ("due_date" >= "invoice_date");

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_total_not_negative" CHECK ("total" >= 0);
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_expiry_after_date" CHECK ("expiry_date" >= "quote_date");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_values_valid" CHECK (
    "quantity" > 0 AND "unit_price" >= 0
    AND "discount_percent" BETWEEN 0 AND 100 AND "tax_rate" BETWEEN 0 AND 100
);
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_values_valid" CHECK (
    "quantity" > 0 AND "unit_price" >= 0
    AND "discount_percent" BETWEEN 0 AND 100 AND "tax_rate" BETWEEN 0 AND 100
);
