import { z } from "zod/v4";
import { protectedProcedure, router } from "../trpc/init";

export const alertRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        interaction_id: z.string().guid().nullable().optional(),
        severity: z.enum(["critical", "high", "medium", "low", "info"]),
        category: z.string(),
        title: z.string(),
        description: z.string(),
        metadata: z.any().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db!.query(
        `INSERT INTO alert (org_id, interaction_id, severity, category, title, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          ctx.orgId, input.interaction_id ?? null,
          input.severity, input.category,
          input.title, input.description,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );
      return { id: result.rows[0].id };
    }),

  list: protectedProcedure
    .input(
      z.object({
        org_id: z.string().guid().optional(),
        status: z.enum(["open", "acknowledged", "resolved", "dismissed"]).optional(),
        severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
        limit: z.number().int().max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = ["org_id = $1"];
      const params: unknown[] = [ctx.orgId];

      if (input.status) {
        params.push(input.status);
        conditions.push(`status = $${params.length}`);
      }
      if (input.severity) {
        params.push(input.severity);
        conditions.push(`severity = $${params.length}`);
      }

      params.push(input.limit);

      const result = await ctx.db!.query(
        `SELECT id, interaction_id, severity, category, title, description, status, created_at
         FROM alert
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params
      );
      return result.rows;
    }),

  resolve: protectedProcedure
    .input(
      z.object({
        alert_id: z.string().guid(),
        status: z.enum(["acknowledged", "resolved", "dismissed"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db!.query(
        `UPDATE alert SET status = $1, resolved_by = $2, resolved_at = now()
         WHERE id = $3 AND status = 'open' AND org_id = $4`,
        [input.status, ctx.userId, input.alert_id, ctx.orgId]
      );
      return { status: input.status };
    }),

  summary: protectedProcedure
    .input(z.object({ org_id: z.string().guid().optional() }).optional())
    .query(async ({ ctx }) => {
      const result = await ctx.db!.query(
        `SELECT severity, status, COUNT(*)::int AS count
         FROM alert WHERE org_id = $1
         GROUP BY severity, status
         ORDER BY severity, status`,
        [ctx.orgId]
      );
      return result.rows;
    }),
});
