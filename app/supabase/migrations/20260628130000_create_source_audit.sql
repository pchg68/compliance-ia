-- Migration: auditoria de consultas a fontes oficiais (governança/prova de diligência)
-- Toda verificação de citação contra fonte externa fica registrada de forma append-only:
-- "consultamos a fonte X para a chave Y em T, com resultado Z". Reforça a evidência
-- de que o escritório efetivamente conferiu — invariante de governança do produto.

-- ============================================================
-- 1. Log append-only de lookups a fontes
-- ============================================================
CREATE TABLE source_lookup_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid REFERENCES organization(id),
  canonical_key  text NOT NULL,
  cite_type      text,
  source         text NOT NULL,                 -- DATAJUD, LexML, cache, etc.
  outcome        text NOT NULL CHECK (outcome IN ('hit','miss','error','cache_hit','circuit_open','rate_limited')),
  http_status    int,
  latency_ms     int,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_source_lookup_log_key ON source_lookup_log(canonical_key);
CREATE INDEX idx_source_lookup_log_created ON source_lookup_log(created_at);
CREATE INDEX idx_source_lookup_log_org ON source_lookup_log(org_id);

ALTER TABLE source_lookup_log ENABLE ROW LEVEL SECURITY;

-- Leitura isolada por tenant (registros sem org são consultas de cache global compartilhado)
CREATE POLICY tenant_isolation_source_lookup_log ON source_lookup_log
  USING (org_id IS NULL OR org_id = current_setting('app.current_org', true)::uuid);

CREATE TRIGGER no_mutation_source_lookup_log
  BEFORE UPDATE OR DELETE ON source_lookup_log
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- ============================================================
-- 2. Melhorias no cache de fontes (escalabilidade)
-- ============================================================
-- Identifica a fonte que respondeu e habilita varredura/expiração eficiente.
ALTER TABLE source_cache ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS idx_source_cache_fetched_at ON source_cache(fetched_at);

-- ============================================================
-- 3. View: cobertura de verificação por fonte (dashboard de governança)
-- ============================================================
CREATE OR REPLACE VIEW v_source_lookup_stats AS
SELECT
  org_id,
  source,
  outcome,
  COUNT(*)::int       AS count,
  AVG(latency_ms)::int AS avg_latency_ms,
  MAX(created_at)     AS last_at
FROM source_lookup_log
GROUP BY org_id, source, outcome;
