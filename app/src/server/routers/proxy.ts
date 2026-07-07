import { z } from "zod/v4";
import { protectedProcedure, router } from "../trpc/init";
import { maskPii } from "@/lib/pii-masker";
import { classifyRisk, type RiskSignals, type DecisionRule } from "@/lib/risk-engine";
import { evaluateAlerts } from "@/lib/alert-rules";

export const proxyRouter = router({
  forward: protectedProcedure
    .input(
      z.object({
        provider: z.string(),
        model: z.string(),
        prompt: z.string(),
        task_type: z.string(),
        signals: z.object({
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
      const startTime = Date.now();

      // 1. Mascarar PII
      const maskResult = maskPii(input.prompt);

      // 2. Classificar risco
      const policyResult = await ctx.db!.query(
        `SELECT rules FROM policy WHERE org_id = $1 AND active = true ORDER BY version DESC LIMIT 1`,
        [orgId]
      );
      const decisionTable: DecisionRule[] =
        policyResult.rows.length > 0
          ? (policyResult.rows[0].rules as { decision_table: DecisionRule[] }).decision_table ?? []
          : [];

      const riskSignals: RiskSignals = {
        task_type: input.task_type,
        ...input.signals,
      };
      const risk = classifyRisk(riskSignals, decisionTable);

      // 3. Decisão de gate
      if (risk.decision === "block") {
        // Registrar proxy_request com bloqueio
        await ctx.db!.query(
          `INSERT INTO proxy_request (org_id, provider, endpoint, status_code, latency_ms, fail_mode)
           VALUES ($1, $2, $3, 403, $4, 'fail_closed')`,
          [orgId, input.provider, `/v1/messages`, Date.now() - startTime]
        );

        // Gerar alertas
        const alerts = evaluateAlerts(riskSignals, "block", maskResult.matches.length);
        for (const alert of alerts) {
          await ctx.db!.query(
            `INSERT INTO alert (org_id, severity, category, title, description)
             VALUES ($1, $2, $3, $4, $5)`,
            [orgId, alert.severity, alert.category, alert.title, alert.description]
          );
        }

        return {
          blocked: true,
          reason: "Interação bloqueada pelo motor de risco",
          risk_tier: risk.tier,
          decision: risk.decision,
          pii_masked: maskResult.matches.length,
          alerts_generated: alerts.length,
        };
      }

      // 4. Em produção: forward para o provedor. Aqui, simulamos.
      const latencyMs = Date.now() - startTime;

      await ctx.db!.query(
        `INSERT INTO proxy_request (org_id, provider, endpoint, status_code, latency_ms, streaming, fail_mode)
         VALUES ($1, $2, $3, 200, $4, false, 'fail_closed')`,
        [orgId, input.provider, `/v1/messages`, latencyMs]
      );

      // Gerar alertas se necessário
      const alerts = evaluateAlerts(riskSignals, risk.decision, maskResult.matches.length);
      for (const alert of alerts) {
        await ctx.db!.query(
          `INSERT INTO alert (org_id, severity, category, title, description)
           VALUES ($1, $2, $3, $4, $5)`,
          [orgId, alert.severity, alert.category, alert.title, alert.description]
        );
      }

      return {
        blocked: false,
        risk_tier: risk.tier,
        decision: risk.decision,
        prompt_masked: maskResult.masked,
        pii_masked: maskResult.matches.length,
        pii_types: [...new Set(maskResult.matches.map((m) => m.type))],
        controls: risk.controls,
        alerts_generated: alerts.length,
        requires_approval: risk.decision === "require_approval",
      };
    }),

  listRequests: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await ctx.db!.query(
        `SELECT id, provider, endpoint, status_code, latency_ms, streaming, fail_mode, created_at
         FROM proxy_request WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [ctx.orgId, input.limit]
      );
      return result.rows;
    }),
});
