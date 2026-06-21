-- Migration: validador de citações + proxy inline + ancoragem Merkle

-- ============================================================
-- 1. Citações
-- ============================================================

CREATE TABLE citation_check (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  uuid NOT NULL REFERENCES ai_interaction(id),
  org_id          uuid NOT NULL REFERENCES organization(id),
  raw_text        text NOT NULL,
  cite_type       text NOT NULL CHECK (cite_type IN ('legislacao','sumula','precedente','tema')),
  canonical_key   text,
  status          text NOT NULL CHECK (status IN ('confirmada','divergente','desatualizada','nao_localizada','nao_verificavel')),
  source          text,
  source_ref      text,
  evidence_excerpt text,
  confidence      numeric(3,2),
  checked_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE source_cache (
  canonical_key   text PRIMARY KEY,
  payload         jsonb NOT NULL,
  fetched_at      timestamptz NOT NULL,
  ttl_seconds     int NOT NULL
);

ALTER TABLE citation_check ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_citation_check ON citation_check
  USING (org_id = current_setting('app.current_org')::uuid);

CREATE TRIGGER no_mutation_citation_check
  BEFORE UPDATE OR DELETE ON citation_check
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- ============================================================
-- 2. Proxy inline — registro de chamadas ao provedor
-- ============================================================

CREATE TABLE proxy_request (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organization(id),
  interaction_id  uuid REFERENCES ai_interaction(id),
  provider        text NOT NULL,
  endpoint        text NOT NULL,
  method          text NOT NULL DEFAULT 'POST',
  status_code     int,
  latency_ms      int,
  streaming       boolean NOT NULL DEFAULT false,
  fail_mode       text NOT NULL DEFAULT 'fail_closed' CHECK (fail_mode IN ('fail_closed','fail_open')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE proxy_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_proxy_request ON proxy_request
  USING (org_id = current_setting('app.current_org')::uuid);

CREATE TRIGGER no_mutation_proxy_request
  BEFORE UPDATE OR DELETE ON proxy_request
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- ============================================================
-- 3. Dashboard — views materializadas para métricas
-- ============================================================

CREATE OR REPLACE VIEW v_dashboard_summary AS
SELECT
  org_id,
  COUNT(*)::int AS total_interactions,
  COUNT(*) FILTER (WHERE decision = 'block')::int AS blocked,
  COUNT(*) FILTER (WHERE decision = 'approval')::int AS pending_approval,
  COUNT(*) FILTER (WHERE decision = 'allow')::int AS allowed,
  COUNT(*) FILTER (WHERE decision = 'masked')::int AS masked,
  COUNT(*) FILTER (WHERE risk_class = 'excessivo')::int AS risk_excessive,
  COUNT(*) FILTER (WHERE risk_class = 'alto')::int AS risk_high,
  COUNT(*) FILTER (WHERE risk_class = 'moderado')::int AS risk_moderate,
  COUNT(*) FILTER (WHERE risk_class = 'baixo')::int AS risk_low,
  COUNT(*) FILTER (WHERE checklist_passed = false)::int AS checklist_failed,
  MIN(created_at) AS first_at,
  MAX(created_at) AS last_at
FROM ai_interaction
GROUP BY org_id;

CREATE OR REPLACE VIEW v_dashboard_daily AS
SELECT
  org_id,
  date_trunc('day', created_at)::date AS day,
  COUNT(*)::int AS interactions,
  COUNT(*) FILTER (WHERE decision = 'block')::int AS blocked,
  COUNT(*) FILTER (WHERE risk_class IN ('excessivo','alto'))::int AS high_risk
FROM ai_interaction
GROUP BY org_id, date_trunc('day', created_at);

CREATE OR REPLACE VIEW v_citation_stats AS
SELECT
  cc.org_id,
  cc.status,
  COUNT(*)::int AS count
FROM citation_check cc
GROUP BY cc.org_id, cc.status;
