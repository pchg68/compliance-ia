import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { PoolClient } from "pg";
import { withOrgContext } from "@/lib/db";

export interface Context {
  orgId: string | null;
  userId: string | null;
  role: string | null;
  email: string | null;
  /** Client com app.current_org já setado (via withOrgContext) — só em protectedProcedure/adminProcedure. */
  db?: PoolClient;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Procedure protegida: exige usuário autenticado com org resolvida, e executa o
 * resolver dentro de uma transação com `app.current_org` setado (withOrgContext) —
 * é isso que faz a RLS por org_id do papel restrito realmente filtrar as queries.
 * `ctx.db` é o client dessa transação; routers devem usá-lo em vez do `pool` global.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.orgId || !ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Autenticação necessária.",
    });
  }
  const orgId = ctx.orgId;
  const userId = ctx.userId;
  return withOrgContext(orgId, (db) =>
    next({
      ctx: { ...ctx, orgId, userId, db },
    })
  );
});

/** Procedure restrita a perfis de administração (RBAC). */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.role || !["admin", "compliance", "developer"].includes(ctx.role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Acesso restrito a perfis administrativos.",
    });
  }
  return next({ ctx });
});
