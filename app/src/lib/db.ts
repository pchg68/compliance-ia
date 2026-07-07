import { Pool, type PoolClient } from "pg";

// Papel restrito (migration 20260706163639): sem BYPASSRLS, sem UPDATE/DELETE/TRUNCATE
// na trilha. É a conexão padrão da aplicação — toda leitura/escrita multi-tenant passa
// por aqui e precisa de app.current_org setado (ver withOrgContext) para a RLS liberar.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://vexiajuris_app:change_me_before_activating@127.0.0.1:54322/postgres";

// Superuser — usado SÓ para o bootstrap de uma organização nova (onboarding.createOrg),
// que por definição ainda não tem org_id para satisfazer a RLS de organization/app_user/
// policy, e precisa verificar unicidade de e-mail entre TODAS as orgs. Nenhuma outra rota
// deve usar este pool: é a única exceção documentada e auditada ao isolamento por RLS.
const BOOTSTRAP_DATABASE_URL =
  process.env.BOOTSTRAP_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const isProduction = process.env.NODE_ENV === "production";

const poolDefaults = {
  // Em produção, usar pool menor porque cada instância serverless da Vercel
  // tem seu próprio pool — o pooler do Supabase (porta 6543) multiplexa.
  max: Number(process.env.PG_POOL_MAX ?? (isProduction ? 3 : 20)),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS ?? 10_000),
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
  // SSL obrigatório no Supabase cloud; desabilitado no local Docker
  ssl: isProduction ? { rejectUnauthorized: false as const } : (false as const),
};

export const pool = new Pool({ connectionString: DATABASE_URL, ...poolDefaults });
export const bootstrapPool = new Pool({ connectionString: BOOTSTRAP_DATABASE_URL, ...poolDefaults });

pool.on("error", (err) => {
  console.error("[pg] erro inesperado no pool restrito:", err.message);
});
bootstrapPool.on("error", (err) => {
  console.error("[pg] erro inesperado no pool de bootstrap:", err.message);
});

/**
 * Executa `fn` numa transação com `app.current_org` setado via set_config(..., true)
 * (escopo da transação — some sozinho no COMMIT/ROLLBACK, seguro mesmo com a conexão
 * voltando para o pool). É o que faz a RLS por org_id realmente filtrar as queries.
 */
export async function withOrgContext<T>(
  orgId: string,
  fn: (db: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.current_org', $1, true)`, [orgId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
