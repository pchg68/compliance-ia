import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";
import { classifyRisk, type RiskSignals, type DecisionRule } from "@/lib/risk-engine";
import { getChecklistItems } from "@/lib/checklist";

export const riskRouter = router({
  assess: publicProcedure
    .input(
      z.object({
        org_id: z.string().uuid(),
        interaction_id: z.string().uuid(),
        signals: z.object({
          task_type: z.string(),
          data_sensitivity: z.array(z.string()),
          legal_effect: z.boolean(),
          autonomy: z.enum(["com_revisao", "sem_revisao"]),
          provider_posture: z.enum(["aprovado", "nao_aprovado"]),
          client_constraints: z.array(z.string()),
          injection_flags: z.array(z.string()),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const policyResult = await pool.query(
        `SELECT rules FROM policy WHERE org_id = $1 AND active = true ORDER BY version DESC LIMIT 1`,
        [input.org_id]
      );

      const decisionTable: DecisionRule[] =
        policyResult.rows.length > 0
          ? (policyResult.rows[0].rules as { decision_table: DecisionRule[] }).decision_table
          : [];

      const result = classifyRisk(input.signals as RiskSignals, decisionTable);
      const checklistItems = getChecklistItems(result.tier);

      await pool.query(
        `INSERT INTO risk_assessment (interaction_id, org_id, signals, tier, matched_rule, decision, controls_applied, computed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.interaction_id,
          input.org_id,
          JSON.stringify(input.signals),
          result.tier,
          result.matched_rule,
          result.decision,
          JSON.stringify(result.controls),
          result.computed_by,
        ]
      );

      return { ...result, checklist_items: checklistItems };
    }),

  submitChecklist: publicProcedure
    .input(
      z.object({
        org_id: z.string().uuid(),
        interaction_id: z.string().uuid(),
        items: z.array(
          z.object({
            eixo: z.string(),
            pergunta: z.string(),
            resposta: z.union([z.boolean(), z.string()]),
            automatico: z.boolean(),
          })
        ),
        attested_by: z.string().uuid(),
        approver_id: z.string().uuid().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const needsApproval = input.approver_id != null;

      const result = await pool.query(
        `INSERT INTO checklist_response (interaction_id, org_id, items, attested_by, approver_id, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          input.interaction_id,
          input.org_id,
          JSON.stringify(input.items),
          input.attested_by,
          input.approver_id,
          needsApproval ? "pendente" : "aprovado",
        ]
      );

      return { id: result.rows[0].id, approval_status: needsApproval ? "pendente" : "aprovado" };
    }),

  approveChecklist: publicProcedure
    .input(
      z.object({
        checklist_id: z.string().uuid(),
        approver_id: z.string().uuid(),
        status: z.enum(["aprovado", "bloqueado", "ressalva"]),
      })
    )
    .mutation(async ({ input }) => {
      await pool.query(
        `UPDATE checklist_response SET approval_status = $1, approver_id = $2, decided_at = now()
         WHERE id = $3 AND approval_status = 'pendente'`,
        [input.status, input.approver_id, input.checklist_id]
      );

      return { status: input.status };
    }),
});
