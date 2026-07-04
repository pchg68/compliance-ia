import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const isProduction = process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: DATABASE_URL,
  // Em produção, usar pool menor porque cada instância serverless da Vercel
  // tem seu próprio pool — o pooler do Supabase (porta 6543) multiplexa.
  max: Number(process.env.PG_POOL_MAX ?? (isProduction ? 3 : 20)),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS ?? 10_000),
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
  // SSL obrigatório no Supabase cloud; desabilitado no local Docker
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("[pg] erro inesperado no pool:", err.message);
});
