-- Migration: ligar app_user ao Supabase Auth (auth.users)
-- Permite resolver org_id + role a partir do usuário autenticado.

-- ============================================================
-- 1. Coluna de ligação com auth.users
-- ============================================================
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS auth_id uuid;

-- Índice para lookup por auth_id e por email (login resolve por um dos dois)
CREATE INDEX IF NOT EXISTS idx_app_user_auth_id ON app_user(auth_id);
CREATE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email);

-- ============================================================
-- 2. Função: resolver contexto (org_id, role) do usuário logado
--    Recebe o email do JWT e devolve a linha de app_user.
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_app_user(p_email citext)
RETURNS TABLE (user_id uuid, org_id uuid, role text, email citext) AS $$
  SELECT id, org_id, role, email
  FROM app_user
  WHERE email = p_email
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- 3. Seed de demonstração (idempotente)
--    Org + usuário admin para o ambiente local.
-- ============================================================
INSERT INTO organization (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Escritório Demonstração')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_user (id, org_id, email, role)
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'admin@demo.jurisos.local',
  'admin'
)
ON CONFLICT (org_id, email) DO NOTHING;
