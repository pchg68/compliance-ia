import { z } from "zod/v4";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../trpc/init";
import { bootstrapPool } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import type { Context } from "../trpc/init";

// Procedure que exige auth Supabase mas tolera ausência de org (para onboarding)
const authOnlyProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.email) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Autenticação necessária." });
  }
  return next({ ctx: ctx as Context & { email: string } });
});

export const onboardingRouter = router({
  // Cria a organização do escritório e vincula o usuário como admin
  createOrg: authOnlyProcedure
    .input(
      z.object({
        org_name: z.string().min(2).max(120),
        jurisdiction: z.string().default("BR"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Bootstrap: org nova ainda não tem org_id para satisfazer a RLS do papel
      // restrito, e a checagem de e-mail precisa enxergar TODAS as orgs — por
      // isso, e só aqui, usamos o pool com privilégio elevado (ver db.ts).
      const client = await bootstrapPool.connect();
      try {
        await client.query("BEGIN");

        // Verifica se email já tem organização
        const existing = await client.query(
          `SELECT id FROM app_user WHERE email = $1 LIMIT 1`,
          [ctx.email]
        );
        if (existing.rows.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Este e-mail já está vinculado a um escritório.",
          });
        }

        // Cria a organização
        const orgResult = await client.query(
          `INSERT INTO organization (name, default_jurisdiction) VALUES ($1, $2) RETURNING id`,
          [input.org_name, input.jurisdiction]
        );
        const orgId = orgResult.rows[0].id as string;

        // Cria o usuário como admin
        const userResult = await client.query(
          `INSERT INTO app_user (org_id, email, role) VALUES ($1, $2, 'admin') RETURNING id`,
          [orgId, ctx.email]
        );
        const userId = userResult.rows[0].id as string;

        // Cria a policy padrão para a jurisdição escolhida
        const { getJurisdiction } = await import("@/lib/jurisdiction");
        const profile = getJurisdiction(input.jurisdiction);
        await client.query(
          `INSERT INTO policy (org_id, version, jurisdiction, rules, active)
           VALUES ($1, 1, $2, $3, true)`,
          [orgId, profile.code, JSON.stringify({ decision_table: profile.decision_table })]
        );

        await client.query("COMMIT");

        return { org_id: orgId, user_id: userId };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),

  // Convida usuário para a organização (admin only)
  inviteUser: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["member", "admin", "compliance", "developer"]).default("member"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db!.query(
        `SELECT id FROM app_user WHERE org_id = $1 AND email = $2`,
        [ctx.orgId, input.email]
      );
      if (existing.rows.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Usuário já cadastrado neste escritório." });
      }

      const result = await ctx.db!.query(
        `INSERT INTO app_user (org_id, email, role) VALUES ($1, $2, $3) RETURNING id`,
        [ctx.orgId, input.email, input.role]
      );

      return { user_id: result.rows[0].id, email: input.email, role: input.role };
    }),

  // Lista usuários da organização
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const result = await ctx.db!.query(
      `SELECT id, email, role, created_at FROM app_user WHERE org_id = $1 ORDER BY created_at`,
      [ctx.orgId]
    );
    return result.rows;
  }),

  // Atualiza papel do usuário
  updateRole: adminProcedure
    .input(z.object({ user_id: z.string().uuid(), role: z.enum(["member", "admin", "compliance", "developer"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db!.query(
        `UPDATE app_user SET role = $1 WHERE id = $2 AND org_id = $3`,
        [input.role, input.user_id, ctx.orgId]
      );
      return { updated: true };
    }),
});
