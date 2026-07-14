import { z } from "zod/v4";
import { protectedProcedure, adminProcedure, router } from "../trpc/init";

export const promptRouter = router({
  // Prompts pré-aprovados são curadoria administrativa (invariante 7).
  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        category: z.string().min(1),
        task_type: z.string().min(1),
        risk_class: z.enum(["excessivo", "alto", "moderado", "baixo"]),
        template_text: z.string().min(1),
        variables: z.array(z.object({ name: z.string(), description: z.string().optional() })).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db!.query(
        `INSERT INTO prompt_template (org_id, title, description, category, task_type, risk_class, template_text, variables, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, version`,
        [
          ctx.orgId, input.title, input.description ?? null,
          input.category, input.task_type, input.risk_class,
          input.template_text, JSON.stringify(input.variables),
          ctx.userId,
        ]
      );
      return result.rows[0];
    }),

  list: protectedProcedure
    .input(
      z.object({
        org_id: z.string().guid().optional(),
        category: z.string().optional(),
        active_only: z.boolean().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = ["org_id = $1"];
      const params: unknown[] = [ctx.orgId];

      if (input.active_only) {
        conditions.push("active = true");
      }
      if (input.category) {
        params.push(input.category);
        conditions.push(`category = $${params.length}`);
      }

      const result = await ctx.db!.query(
        `SELECT id, title, description, category, task_type, risk_class, template_text, variables, version, active, created_at
         FROM prompt_template
         WHERE ${conditions.join(" AND ")}
         ORDER BY category, title`,
        params
      );
      return result.rows;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().guid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db!.query(
        `SELECT * FROM prompt_template WHERE id = $1 AND org_id = $2`,
        [input.id, ctx.orgId]
      );
      return result.rows[0] ?? null;
    }),

  render: protectedProcedure
    .input(
      z.object({
        template_id: z.string().guid(),
        values: z.record(z.string(), z.string()),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await ctx.db!.query(
        `SELECT template_text, variables, task_type, risk_class FROM prompt_template WHERE id = $1 AND org_id = $2 AND active = true`,
        [input.template_id, ctx.orgId]
      );
      if (!result.rows[0]) throw new Error("Template não encontrado ou inativo");

      const template = result.rows[0];
      let rendered = template.template_text as string;

      for (const [key, value] of Object.entries(input.values)) {
        rendered = rendered.replaceAll(`{{${key}}}`, value);
      }

      return {
        prompt: rendered,
        task_type: template.task_type,
        risk_class: template.risk_class,
      };
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string().guid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db!.query(
        `UPDATE prompt_template SET active = false, updated_at = now() WHERE id = $1 AND org_id = $2`,
        [input.id, ctx.orgId]
      );
      return { deactivated: true };
    }),
});
