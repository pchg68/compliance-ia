-- Migration: motor de classificação de risco + checklist ético (OAB 001/2024)

CREATE TABLE risk_assessment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  uuid NOT NULL REFERENCES ai_interaction(id),
  org_id          uuid NOT NULL REFERENCES organization(id),
  signals         jsonb NOT NULL,
  tier            text NOT NULL CHECK (tier IN ('vedado','alto','moderado','residual')),
  matched_rule    text,
  decision        text NOT NULL CHECK (decision IN ('block','require_approval','allow_with_masking','allow')),
  controls_applied jsonb NOT NULL,
  computed_by     text NOT NULL CHECK (computed_by IN ('deterministico','llm_assistido')),
  assessed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checklist_response (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  uuid NOT NULL REFERENCES ai_interaction(id),
  org_id          uuid NOT NULL REFERENCES organization(id),
  items           jsonb NOT NULL,
  attested_by     uuid REFERENCES app_user(id),
  approver_id     uuid REFERENCES app_user(id),
  approval_status text CHECK (approval_status IN ('pendente','aprovado','bloqueado','ressalva')),
  decided_at      timestamptz
);

-- RLS
ALTER TABLE risk_assessment ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_response ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_risk_assessment ON risk_assessment
  USING (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_checklist_response ON checklist_response
  USING (org_id = current_setting('app.current_org', true)::uuid);

-- Append-only para risk_assessment (evidência de classificação não pode ser alterada)
CREATE TRIGGER no_mutation_risk_assessment
  BEFORE UPDATE OR DELETE ON risk_assessment
  FOR EACH ROW EXECUTE FUNCTION block_mutation();

-- Checklist: bloqueia DELETE (status pode ser atualizado no fluxo de aprovação)
CREATE TRIGGER no_delete_checklist_response
  BEFORE DELETE ON checklist_response
  FOR EACH ROW EXECUTE FUNCTION block_mutation();
