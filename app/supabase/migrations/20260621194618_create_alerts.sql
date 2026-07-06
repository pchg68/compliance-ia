-- Migration: sistema de alertas para compliance e risco

CREATE TABLE alert (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organization(id),
  interaction_id  uuid REFERENCES ai_interaction(id),
  severity        text NOT NULL CHECK (severity IN ('critical','high','medium','low','info')),
  category        text NOT NULL,
  title           text NOT NULL,
  description     text NOT NULL,
  metadata        jsonb,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  resolved_by     uuid REFERENCES app_user(id),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_org_status ON alert (org_id, status);
CREATE INDEX idx_alert_org_severity ON alert (org_id, severity);

ALTER TABLE alert ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_alert ON alert
  USING (org_id = current_setting('app.current_org', true)::uuid);

-- Alertas são append-only (evidência de compliance)
CREATE TRIGGER no_delete_alert
  BEFORE DELETE ON alert
  FOR EACH ROW EXECUTE FUNCTION block_mutation();
