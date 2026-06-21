import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";

export const dashboardRouter = router({
  summary: publicProcedure
    .input(z.object({ org_id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM v_dashboard_summary WHERE org_id = $1`,
        [input.org_id]
      );
      return result.rows[0] ?? null;
    }),

  daily: publicProcedure
    .input(
      z.object({
        org_id: z.string().uuid(),
        days: z.number().int().max(90).default(30),
      })
    )
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM v_dashboard_daily
         WHERE org_id = $1 AND day >= current_date - $2::int
         ORDER BY day DESC`,
        [input.org_id, input.days]
      );
      return result.rows;
    }),

  citationStats: publicProcedure
    .input(z.object({ org_id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM v_citation_stats WHERE org_id = $1`,
        [input.org_id]
      );
      return result.rows;
    }),

  alertStats: publicProcedure
    .input(z.object({ org_id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT severity, status, COUNT(*)::int AS count
         FROM alert WHERE org_id = $1
         GROUP BY severity, status
         ORDER BY severity, status`,
        [input.org_id]
      );
      return result.rows;
    }),

  topUsers: publicProcedure
    .input(
      z.object({
        org_id: z.string().uuid(),
        limit: z.number().int().max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT u.email, COUNT(*)::int AS interactions,
                COUNT(*) FILTER (WHERE i.decision = 'block')::int AS blocked
         FROM ai_interaction i
         JOIN app_user u ON u.id = i.user_id
         WHERE i.org_id = $1
         GROUP BY u.email
         ORDER BY interactions DESC
         LIMIT $2`,
        [input.org_id, input.limit]
      );
      return result.rows;
    }),
});
