-- Ledger integrity at the database level (the services check the same rules first). Prisma does not model CHECK
-- constraints or triggers, so they live only in this migration. See docs/accounting.md.

-- A line is either a debit or a credit: exactly one side is positive, neither is negative.
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_one_side" CHECK (
    "debit" >= 0 AND "credit" >= 0 AND (("debit" > 0) <> ("credit" > 0))
);

ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount" > 0);

-- Every journal entry balances: Σ debit = Σ credit. Checked at COMMIT (deferred), so an entry's lines can be
-- inserted one by one inside the transaction that creates it.
CREATE FUNCTION "check_journal_entry_balanced"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target uuid := COALESCE(NEW."entry_id", OLD."entry_id");
    difference numeric;
BEGIN
    SELECT COALESCE(SUM("debit"), 0) - COALESCE(SUM("credit"), 0)
    INTO difference
    FROM "journal_lines"
    WHERE "entry_id" = target;
    IF difference <> 0 THEN
        RAISE EXCEPTION 'Journal entry % is not balanced (debits - credits = %)', target, difference
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "journal_lines_balanced"
AFTER INSERT OR UPDATE OR DELETE ON "journal_lines"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "check_journal_entry_balanced"();
