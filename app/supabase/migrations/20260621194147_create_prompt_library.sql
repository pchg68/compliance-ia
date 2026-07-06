-- Migration: biblioteca de prompts aprovados (PromptJur)
-- Prompts pré-aprovados reduzem atrito: carregam nível de risco conhecido,
-- pulam reclassificação e já vêm com checklist adequado.

CREATE TABLE prompt_template (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organization(id),
  title           text NOT NULL,
  description     text,
  category        text NOT NULL,
  task_type       text NOT NULL,
  risk_class      text NOT NULL CHECK (risk_class IN ('excessivo','alto','moderado','baixo')),
  template_text   text NOT NULL,
  variables       jsonb NOT NULL DEFAULT '[]',
  approved_by     uuid REFERENCES app_user(id),
  active          boolean NOT NULL DEFAULT true,
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, title, version)
);

ALTER TABLE prompt_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_prompt_template ON prompt_template
  USING (org_id = current_setting('app.current_org', true)::uuid);
