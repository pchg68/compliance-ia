-- Migration: resolve_app_user precisa rodar antes de sabermos a org do usuário
-- (é literalmente o que ela descobre) — com o papel restrito vexiajuris_app ativo
-- (migration 20260706163639), essa consulta roda numa conexão sem app.current_org
-- setado ainda, e a RLS de app_user filtra silenciosamente para zero linhas
-- (current_setting(..., true) devolve NULL numa sessão nova; org_id = NULL nunca
-- é verdadeiro). Isso quebrava a resolução de contexto em toda request autenticada.
--
-- SECURITY DEFINER é o furo estreito e intencional: só esta função (só leitura,
-- só retorna user_id/org_id/role/email para o e-mail informado) roda com o
-- privilégio do dono, ignorando RLS — nenhuma outra rota ganha esse privilégio.
ALTER FUNCTION resolve_app_user(citext)
  SECURITY DEFINER
  SET search_path = public, pg_temp;
