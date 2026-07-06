import { z } from "zod/v4";
import { protectedProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";

export const dashboardRouter = router({
  summary: protectedProcedure
    .input(z.object({ org_id: z.string().guid().optional() }).optional())
    .query(async ({ ctx }) => {
      const result = await pool.query(
        `SELECT * FROM v_dashboard_summary WHERE org_id = $1`,
        [ctx.orgId]
      );
      return result.rows[0] ?? null;
    }),

  daily: protectedProcedure
    .input(
      z.object({
        org_id: z.string().guid().optional(),
        days: z.number().int().max(90).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await pool.query(
        `SELECT * FROM v_dashboard_daily
         WHERE org_id = $1 AND day >= current_date - $2::int
         ORDER BY day DESC`,
        [ctx.orgId, input.days]
      );
      return result.rows;
    }),

  citationStats: protectedProcedure
    .input(z.object({ org_id: z.string().guid().optional() }).optional())
    .query(async ({ ctx }) => {
      const result = await pool.query(
        `SELECT * FROM v_citation_stats WHERE org_id = $1`,
        [ctx.orgId]
      );
      return result.rows;
    }),

  alertStats: protectedProcedure
    .input(z.object({ org_id: z.string().guid().optional() }).optional())
    .query(async ({ ctx }) => {
      const result = await pool.query(
        `SELECT severity, status, COUNT(*)::int AS count
         FROM alert WHERE org_id = $1
         GROUP BY severity, status
         ORDER BY severity, status`,
        [ctx.orgId]
      );
      return result.rows;
    }),

  topUsers: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await pool.query(
        `SELECT u.email, COUNT(*)::int AS interactions,
                COUNT(*) FILTER (WHERE i.decision = 'block')::int AS blocked
         FROM ai_interaction i
         JOIN app_user u ON u.id = i.user_id
         WHERE i.org_id = $1
         GROUP BY u.email
         ORDER BY interactions DESC
         LIMIT $2`,
        [ctx.orgId, input.limit]
      );
      return result.rows;
    }),
});
