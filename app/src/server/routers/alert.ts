import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";

export const alertRouter = router({
  create: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        interaction_id: z.string().guid().nullable().optional(),
        severity: z.enum(["critical", "high", "medium", "low", "info"]),
        category: z.string(),
        title: z.string(),
        description: z.string(),
        metadata: z.any().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await pool.query(
        `INSERT INTO alert (org_id, interaction_id, severity, category, title, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          input.org_id, input.interaction_id ?? null,
          input.severity, input.category,
          input.title, input.description,
          input.metadata ? JSON.stringify(input.metadata) : null,
        ]
      );
      return { id: result.rows[0].id };
    }),

  list: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        status: z.enum(["open", "acknowledged", "resolved", "dismissed"]).optional(),
        severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
        limit: z.number().int().max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const conditions = ["org_id = $1"];
      const params: unknown[] = [input.org_id];

      if (input.status) {
        params.push(input.status);
        conditions.push(`status = $${params.length}`);
      }
      if (input.severity) {
        params.push(input.severity);
        conditions.push(`severity = $${params.length}`);
      }

      params.push(input.limit);

      const result = await pool.query(
        `SELECT id, interaction_id, severity, category, title, description, status, created_at
         FROM alert
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params
      );
      return result.rows;
    }),

  resolve: publicProcedure
    .input(
      z.object({
        alert_id: z.string().guid(),
        resolved_by: z.string().guid(),
        status: z.enum(["acknowledged", "resolved", "dismissed"]),
      })
    )
    .mutation(async ({ input }) => {
      await pool.query(
        `UPDATE alert SET status = $1, resolved_by = $2, resolved_at = now()
         WHERE id = $3 AND status = 'open'`,
        [input.status, input.resolved_by, input.alert_id]
      );
      return { status: input.status };
    }),

  summary: publicProcedure
    .input(z.object({ org_id: z.string().guid() }))
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
});
