-- Phase 13: audit logs are append-only, enforced by the database (see docs/audit-logs.md).
-- No role, API or code path may change or delete an audit entry. The only permitted UPDATE is the database itself
-- clearing actor_id when a user account is deleted (foreign key ON DELETE SET NULL); every other column must stay
-- identical.
CREATE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit log entries cannot be deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.actor_id IS NULL
     AND NEW.id = OLD.id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.action = OLD.action
     AND NEW.entity_type = OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.before IS NOT DISTINCT FROM OLD.before
     AND NEW.after IS NOT DISTINCT FROM OLD.after
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address
     AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Audit log entries cannot be changed' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();

-- Outbox rows: attempts never negative; a sent row has its sent time.
ALTER TABLE "email_outbox"
  ADD CONSTRAINT "email_outbox_attempts_not_negative" CHECK ("attempts" >= 0),
  ADD CONSTRAINT "email_outbox_sent_at_matches_status" CHECK (("status" = 'SENT') = ("sent_at" IS NOT NULL));
