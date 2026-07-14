import { z } from "zod/v4";
import { protectedProcedure, adminProcedure, router } from "../trpc/init";
import { classifyRisk, type RiskSignals, type DecisionRule } from "@/lib/risk-engine";
import { getChecklistForTier } from "@/lib/jurisdiction";

export const riskRouter = router({
  assess: protectedProcedure
    .input(
      z.object({
        interaction_id: z.string().guid(),
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
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.orgId;
      const policyResult = await ctx.db!.query(
        `SELECT rules, jurisdiction FROM policy WHERE org_id = $1 AND active = true ORDER BY version DESC LIMIT 1`,
        [orgId]
      );

      const decisionTable: DecisionRule[] =
        policyResult.rows.length > 0
          ? (policyResult.rows[0].rules as { decision_table: DecisionRule[] }).decision_table
          : [];

      const result = classifyRisk(input.signals as RiskSignals, decisionTable);

      // Checklist ético segue a jurisdição ativa da política, não um default fixo BR.
      const jurisdictionCode = policyResult.rows[0]?.jurisdiction as string | undefined;
      const checklistItems = getChecklistForTier(jurisdictionCode, result.tier);

      await ctx.db!.query(
        `INSERT INTO risk_assessment (interaction_id, org_id, signals, tier, matched_rule, decision, controls_applied, computed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.interaction_id,
          orgId,
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

  submitChecklist: protectedProcedure
    .input(
      z.object({
        interaction_id: z.string().guid(),
        items: z.array(
          z.object({
            eixo: z.string(),
            pergunta: z.string(),
            resposta: z.union([z.boolean(), z.string()]),
            automatico: z.boolean(),
          })
        ),
        needs_approval: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db!.query(
        `INSERT INTO checklist_response (interaction_id, org_id, items, attested_by, approver_id, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          input.interaction_id,
          ctx.orgId,
          JSON.stringify(input.items),
          ctx.userId,
          null,
          input.needs_approval ? "pendente" : "aprovado",
        ]
      );

      return { id: result.rows[0].id, approval_status: input.needs_approval ? "pendente" : "aprovado" };
    }),

  approveChecklist: adminProcedure
    .input(
      z.object({
        checklist_id: z.string().guid(),
        status: z.enum(["aprovado", "bloqueado", "ressalva"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db!.query(
        `UPDATE checklist_response SET approval_status = $1, approver_id = $2, decided_at = now()
         WHERE id = $3 AND approval_status = 'pendente' AND org_id = $4`,
        [input.status, ctx.userId, input.checklist_id, ctx.orgId]
      );

      return { status: input.status };
    }),
});
