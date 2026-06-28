import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";

export interface Context {
  orgId: string | null;
  userId: string | null;
  role: string | null;
  email: string | null;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Procedure protegida: exige usuário autenticado com org resolvida.
 * Garante orgId/userId não-nulos no contexto downstream.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.orgId || !ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Autenticação necessária.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      orgId: ctx.orgId,
      userId: ctx.userId,
    },
  });
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
