-- Migration: fecha lacunas do invariante 1 (trilha append-only) encontradas em auditoria.
--
-- 1. RLS estava faltando em organization/app_user/policy — as três tabelas centrais
--    de tenancy, identidade e política. Sem isso, mesmo corrigindo a aplicação para
--    setar app.current_org corretamente, essas três tabelas continuariam sem
--    isolamento por org no nível do banco.
-- 2. O invariante exige "REVOKE no papel da aplicação" além do trigger append-only —
--    hoje a aplicação conecta como `postgres` (superuser/dono), que ignora RLS e
--    pode até desabilitar triggers. Criamos aqui o papel restrito e o REVOKE
--    correspondente, mas isso fica PREPARADO, NÃO ATIVADO: a connection string da
--    aplicação (src/lib/db.ts) continua usando `postgres` até que:
--      a) a senha do papel restrito seja provisionada via variável de ambiente, e
--      b) haja um banco vivo para validar que nenhuma query legítima quebra ao
--         perder privilégios de superuser (não foi possível validar nesta sessão
--         porque o Supabase local não estava disponível).
--    Ver CLAUDE.md — "Ambiente local" — para o próximo passo de ativação.

-- ============================================================
-- 1. RLS nas tabelas de tenancy/identidade/política
-- ============================================================

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user      ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy        ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_organization ON organization
  USING (id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_app_user ON app_user
  USING (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_policy ON policy
  USING (org_id = current_setting('app.current_org', true)::uuid);

-- ============================================================
-- 2. Papel de aplicação restrito (defesa em profundidade) — preparado, não ativado
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vexiajuris_app') THEN
    CREATE ROLE vexiajuris_app LOGIN PASSWORD 'change_me_before_activating';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO vexiajuris_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vexiajuris_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vexiajuris_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vexiajuris_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO vexiajuris_app;

-- A trilha append-only nunca aceita UPDATE/DELETE/TRUNCATE do papel de aplicação,
-- mesmo que o trigger falhe por algum motivo — segunda camada de defesa.
REVOKE UPDATE, DELETE, TRUNCATE ON ai_interaction, token_map, audit_anchor, source_lookup_log
  FROM vexiajuris_app;
