import { z } from "zod/v4";
import { adminProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";

export const reportRouter = router({
  compliance: adminProcedure
    .input(
      z.object({
        org_id: z.string().guid().optional(),
        period_start: z.string().datetime(),
        period_end: z.string().datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      const org_id = ctx.orgId;
      const { period_start, period_end } = input;

      const [summary, byRisk, byDecision, byTaskType, byUser, chainStatus] =
        await Promise.all([
          pool.query(
            `SELECT
               COUNT(*)::int AS total_interactions,
               COUNT(*) FILTER (WHERE checklist_passed = true)::int AS checklist_passed,
               COUNT(*) FILTER (WHERE checklist_passed = false)::int AS checklist_failed,
               MIN(created_at) AS first_interaction,
               MAX(created_at) AS last_interaction
             FROM ai_interaction
             WHERE org_id = $1 AND created_at BETWEEN $2 AND $3`,
            [org_id, period_start, period_end]
          ),
          pool.query(
            `SELECT risk_class, COUNT(*)::int AS count
             FROM ai_interaction
             WHERE org_id = $1 AND created_at BETWEEN $2 AND $3
             GROUP BY risk_class ORDER BY count DESC`,
            [org_id, period_start, period_end]
          ),
          pool.query(
            `SELECT decision, COUNT(*)::int AS count
             FROM ai_interaction
             WHERE org_id = $1 AND created_at BETWEEN $2 AND $3
             GROUP BY decision ORDER BY count DESC`,
            [org_id, period_start, period_end]
          ),
          pool.query(
            `SELECT task_type, COUNT(*)::int AS count
             FROM ai_interaction
             WHERE org_id = $1 AND created_at BETWEEN $2 AND $3
             GROUP BY task_type ORDER BY count DESC`,
            [org_id, period_start, period_end]
          ),
          pool.query(
            `SELECT u.email, COUNT(*)::int AS count
             FROM ai_interaction i
             JOIN app_user u ON u.id = i.user_id
             WHERE i.org_id = $1 AND i.created_at BETWEEN $2 AND $3
             GROUP BY u.email ORDER BY count DESC`,
            [org_id, period_start, period_end]
          ),
          pool.query(
            `SELECT
               COUNT(*)::int AS total_records,
               bool_and(row_hash IS NOT NULL)::boolean AS all_hashed
             FROM ai_interaction
             WHERE org_id = $1 AND created_at BETWEEN $2 AND $3`,
            [org_id, period_start, period_end]
          ),
        ]);

      const org = await pool.query(`SELECT name FROM organization WHERE id = $1`, [org_id]);

      return {
        report_type: "compliance",
        generated_at: new Date().toISOString(),
        organization: org.rows[0]?.name ?? org_id,
        period: { start: period_start, end: period_end },
        summary: summary.rows[0],
        breakdown: {
          by_risk_class: byRisk.rows,
          by_decision: byDecision.rows,
          by_task_type: byTaskType.rows,
          by_user: byUser.rows,
        },
        chain_integrity: chainStatus.rows[0],
        regulatory_references: [
          "Recomendação OAB nº 001/2024",
          "PL 2338/2023 (Marco Legal da IA)",
          "ANPD — Agenda Regulatória 2025–2026",
          "CNJ — Resolução nº 615/2025",
        ],
      };
    }),
});
