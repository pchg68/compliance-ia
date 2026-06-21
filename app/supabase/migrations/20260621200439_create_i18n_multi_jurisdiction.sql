-- Migration: internacionalização e multi-jurisdição (Fase 4)
-- Habilita troca BR ↔ EU por configuração de política, sem mudança de código.

-- ============================================================
-- 1. Configuração de jurisdição por organização
-- ============================================================

CREATE TABLE jurisdiction_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organization(id),
  jurisdiction    text NOT NULL,
  label           text NOT NULL,
  locale          text NOT NULL DEFAULT 'pt-BR',
  regulatory_refs jsonb NOT NULL DEFAULT '[]',
  risk_levels     jsonb NOT NULL,
  active          boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, jurisdiction)
);

ALTER TABLE jurisdiction_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_jurisdiction_config ON jurisdiction_config
  USING (org_id = current_setting('app.current_org')::uuid);

-- ============================================================
-- 2. Tabela de traduções (labels de UI e relatórios)
-- ============================================================

CREATE TABLE i18n_message (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  locale          text NOT NULL,
  message_key     text NOT NULL,
  message_text    text NOT NULL,
  UNIQUE (locale, message_key)
);

-- ============================================================
-- 3. Seed: mensagens PT-BR e EN
-- ============================================================

INSERT INTO i18n_message (locale, message_key, message_text) VALUES
  -- Níveis de risco (BR)
  ('pt-BR', 'risk.vedado', 'Vedado (risco excessivo)'),
  ('pt-BR', 'risk.alto', 'Alto'),
  ('pt-BR', 'risk.moderado', 'Moderado'),
  ('pt-BR', 'risk.residual', 'Residual (baixo)'),
  -- Decisões (BR)
  ('pt-BR', 'decision.block', 'Bloqueado'),
  ('pt-BR', 'decision.require_approval', 'Requer aprovação'),
  ('pt-BR', 'decision.allow_with_masking', 'Permitido com mascaramento'),
  ('pt-BR', 'decision.allow', 'Permitido'),
  -- Checklist eixos (BR)
  ('pt-BR', 'checklist.legislacao', 'Legislação aplicável / verificação'),
  ('pt-BR', 'checklist.confidencialidade', 'Confidencialidade e privacidade'),
  ('pt-BR', 'checklist.etica', 'Prática ética (supervisão e responsabilidade)'),
  ('pt-BR', 'checklist.comunicacao', 'Comunicação sobre uso de IA'),
  -- Referências regulatórias (BR)
  ('pt-BR', 'reg.oab_001_2024', 'Recomendação OAB nº 001/2024'),
  ('pt-BR', 'reg.pl_2338', 'PL 2338/2023 (Marco Legal da IA)'),
  ('pt-BR', 'reg.anpd_agenda', 'ANPD — Agenda Regulatória 2025–2026'),
  ('pt-BR', 'reg.cnj_615', 'CNJ — Resolução nº 615/2025'),

  -- Risk levels (EU)
  ('en', 'risk.unacceptable', 'Unacceptable risk'),
  ('en', 'risk.high', 'High risk'),
  ('en', 'risk.limited', 'Limited risk'),
  ('en', 'risk.minimal', 'Minimal risk'),
  -- Decisions (EU)
  ('en', 'decision.block', 'Blocked'),
  ('en', 'decision.require_approval', 'Requires approval'),
  ('en', 'decision.allow_with_masking', 'Allowed with masking'),
  ('en', 'decision.allow', 'Allowed'),
  -- Checklist axes (EU / GDPR)
  ('en', 'checklist.lawfulness', 'Lawfulness, fairness and transparency'),
  ('en', 'checklist.data_protection', 'Data protection and DPIA'),
  ('en', 'checklist.human_oversight', 'Human oversight and accountability'),
  ('en', 'checklist.transparency', 'AI Act transparency obligations'),
  -- Regulatory references (EU)
  ('en', 'reg.ai_act', 'EU AI Act (Regulation 2024/1689)'),
  ('en', 'reg.gdpr', 'GDPR (Regulation 2016/679)'),
  ('en', 'reg.eu_charter', 'EU Charter of Fundamental Rights')
ON CONFLICT (locale, message_key) DO NOTHING;

-- ============================================================
-- 4. Adicionar campo jurisdiction à tabela organization
-- ============================================================

ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS default_jurisdiction text NOT NULL DEFAULT 'BR';
