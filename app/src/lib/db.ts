import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new Pool({ connectionString: DATABASE_URL });
