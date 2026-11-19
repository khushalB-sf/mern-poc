-- The audit trail can be added to but never edited or removed, even by the application's own database role.
-- (TRUNCATE is not a row operation and is not covered: take it away with privileges, see docs/ops.md.)
CREATE OR REPLACE FUNCTION audit_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only' USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_event_no_change
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_append_only();
