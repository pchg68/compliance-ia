import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Pool dimensionado para alto volume. Em produção, apontar DATABASE_URL para o
 * pooler do Supabase (PgBouncer, porta 6543) em vez da conexão direta — o
 * Postgres tem limite baixo de conexões diretas e o pooler multiplexa milhares
 * de clientes sobre poucas conexões reais.
 */
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS ?? 10_000),
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 15_000),
});

pool.on("error", (err) => {
  // Não derrubar o processo por erro de conexão ociosa.
  console.error("[pg] erro inesperado no pool:", err.message);
});
