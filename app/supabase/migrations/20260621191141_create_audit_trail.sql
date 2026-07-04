-- Migration: trilha de auditoria imutável (coração jurídico do Vexiajuris Guard)
-- Tabelas: organization, app_user, policy, ai_interaction, token_map, audit_anchor
-- Inclui: RLS por org_id, trigger append-only, REVOKE de mutação

-- ============================================================
-- 1. Extensões necessárias
-- ============================================================
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- 2. Tabelas de suporte (tenancy + identidade + política)
-- ============================================================

CREATE TABLE organization (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organization(id),
  email      citext NOT NULL,
  role       text NOT NULL CHECK (role IN ('member','admin','compliance','developer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE policy (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  version       int NOT NULL,
  jurisdiction  text NOT NULL DEFAULT 'BR',
  rules         jsonb NOT NULL,
  active        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, version)
);

-- ============================================================
-- 3. Trilha de auditoria (append-only, cadeia de hash)
-- ============================================================

CREATE TABLE ai_interaction (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organization(id),
  seq                bigint NOT NULL,
  user_id            uuid NOT NULL REFERENCES app_user(id),

  provider           text NOT NULL,
  model              text NOT NULL,
  task_type          text NOT NULL,
  risk_class         text NOT NULL,

  prompt_masked      text NOT NULL,
  response_masked    text,
  prompt_orig_hash   bytea NOT NULL,
  response_orig_hash bytea,

  policy_id          uuid NOT NULL REFERENCES policy(id),
  decision           text NOT NULL,
  pii_technique      jsonb,
  injection_flags    jsonb,
  checklist_passed   boolean NOT NULL,
  citations          jsonb,

  prev_hash          bytea,
  row_hash           bytea NOT NULL,
  hash_schema_version int NOT NULL DEFAULT 1,

  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, seq)
);

CREATE TABLE token_map (
  interaction_id   uuid PRIMARY KEY REFERENCES ai_interaction(id),
  org_id           uuid NOT NULL REFERENCES organization(id),
  ciphertext       bytea NOT NULL,
  wrapped_data_key bytea NOT NULL
);

CREATE TABLE audit_anchor (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organization(id),
  epoch_from_seq bigint NOT NULL,
  epoch_to_seq   bigint NOT NULL,
  merkle_root    bytea NOT NULL,
  tsa_token      bytea NOT NULL,
  anchored_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. Row-Level Security (isolamento multi-tenant)
-- ============================================================

ALTER TABLE ai_interaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_map      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_anchor   ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ai_interaction ON ai_interaction
  USING (org_id = current_setting('app.current_org')::uuid);

CREATE POLICY tenant_isolation_token_map ON token_map
  USING (org_id = current_setting('app.current_org')::uuid);

CREATE POLICY tenant_isolation_audit_anchor ON audit_anchor
  USING (org_id = current_setting('app.current_org')::uuid);

-- ============================================================
-- 5. Append-only: trigger que bloqueia UPDATE e DELETE
-- ============================================================

CREATE OR REPLACE FUNCTION block_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'registro imutável: UPDATE/DELETE proibido na tabela %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_mutation_ai_interaction
  BEFORE UPDATE OR DELETE ON ai_interaction
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE TRIGGER no_mutation_token_map
  BEFORE UPDATE OR DELETE ON token_map
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

CREATE TRIGGER no_mutation_audit_anchor
  BEFORE UPDATE OR DELETE ON audit_anchor
  FOR EACH ROW EXECUTE FUNCTION block_mutation();
