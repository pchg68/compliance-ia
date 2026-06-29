import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";
import { getJurisdiction, listJurisdictions } from "@/lib/jurisdiction";

export const jurisdictionRouter = router({
  list: publicProcedure.query(() => {
    return listJurisdictions();
  }),

  get: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      const profile = getJurisdiction(input.code);
      return {
        code: profile.code,
        label: profile.label,
        locale: profile.locale,
        risk_levels: profile.risk_levels,
        checklist_alto_count: profile.checklist_alto.length,
        checklist_moderado_count: profile.checklist_moderado.length,
        regulatory_refs: profile.regulatory_refs,
      };
    }),

  getChecklist: publicProcedure
    .input(
      z.object({
        code: z.string(),
        tier: z.enum(["vedado", "alto", "moderado", "residual"]),
      })
    )
    .query(({ input }) => {
      const profile = getJurisdiction(input.code);
      switch (input.tier) {
        case "alto":
          return profile.checklist_alto;
        case "moderado":
          return profile.checklist_moderado;
        default:
          return [];
      }
    }),

  getDecisionTable: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(({ input }) => {
      const profile = getJurisdiction(input.code);
      return profile.decision_table;
    }),

  configure: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        jurisdiction: z.string(),
        active: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const profile = getJurisdiction(input.jurisdiction);

      await pool.query(
        `INSERT INTO jurisdiction_config (org_id, jurisdiction, label, locale, regulatory_refs, risk_levels, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (org_id, jurisdiction) DO UPDATE SET active = $7, label = $3`,
        [
          input.org_id, profile.code, profile.label, profile.locale,
          JSON.stringify(profile.regulatory_refs),
          JSON.stringify(profile.risk_levels),
          input.active,
        ]
      );

      // Criar/atualizar a policy com a decision_table da jurisdição
      const existingPolicy = await pool.query(
        `SELECT id, version FROM policy WHERE org_id = $1 AND jurisdiction = $2 ORDER BY version DESC LIMIT 1`,
        [input.org_id, profile.code]
      );

      const nextVersion = existingPolicy.rows.length > 0
        ? existingPolicy.rows[0].version + 1
        : 1;

      // Desativar policies anteriores desta jurisdição
      await pool.query(
        `UPDATE policy SET active = false WHERE org_id = $1 AND jurisdiction = $2`,
        [input.org_id, profile.code]
      );

      await pool.query(
        `INSERT INTO policy (org_id, version, jurisdiction, rules, active)
         VALUES ($1, $2, $3, $4, true)`,
        [
          input.org_id, nextVersion, profile.code,
          JSON.stringify({ decision_table: profile.decision_table }),
        ]
      );

      if (input.active) {
        await pool.query(
          `UPDATE organization SET default_jurisdiction = $1 WHERE id = $2`,
          [profile.code, input.org_id]
        );
      }

      return { jurisdiction: profile.code, policy_version: nextVersion };
    }),

  getMessages: publicProcedure
    .input(z.object({ locale: z.string() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT message_key, message_text FROM i18n_message WHERE locale = $1`,
        [input.locale]
      );
      const messages: Record<string, string> = {};
      for (const row of result.rows) {
        messages[row.message_key] = row.message_text;
      }
      return messages;
    }),
});
