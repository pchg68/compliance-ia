import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import type { Context } from "@/server/trpc/init";
import { supabase } from "@/lib/supabase";
import { pool } from "@/lib/db";

const EMPTY_CONTEXT: Context = {
  orgId: null,
  userId: null,
  role: null,
  email: null,
};

async function createContext(req: Request): Promise<Context> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return EMPTY_CONTEXT;
  }

  const token = authHeader.slice(7);

  // Verifica o JWT junto ao Supabase Auth
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return EMPTY_CONTEXT;
  }

  // Resolve org_id + role a partir do email autenticado
  const result = await pool.query(
    `SELECT user_id, org_id, role, email FROM resolve_app_user($1)`,
    [data.user.email]
  );

  if (result.rows.length === 0) {
    // Usuário autenticado mas sem vínculo a um escritório
    return { ...EMPTY_CONTEXT, email: data.user.email };
  }

  const row = result.rows[0];
  return {
    orgId: row.org_id,
    userId: row.user_id,
    role: row.role,
    email: row.email,
  };
}

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
  });
}

export { handler as GET, handler as POST };
