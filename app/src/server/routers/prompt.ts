import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";

export const promptRouter = router({
  create: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        category: z.string().min(1),
        task_type: z.string().min(1),
        risk_class: z.enum(["excessivo", "alto", "moderado", "baixo"]),
        template_text: z.string().min(1),
        variables: z.array(z.object({ name: z.string(), description: z.string().optional() })).default([]),
        approved_by: z.string().guid().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await pool.query(
        `INSERT INTO prompt_template (org_id, title, description, category, task_type, risk_class, template_text, variables, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, version`,
        [
          input.org_id, input.title, input.description ?? null,
          input.category, input.task_type, input.risk_class,
          input.template_text, JSON.stringify(input.variables),
          input.approved_by ?? null,
        ]
      );
      return result.rows[0];
    }),

  list: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        category: z.string().optional(),
        active_only: z.boolean().default(true),
      })
    )
    .query(async ({ input }) => {
      const conditions = ["org_id = $1"];
      const params: unknown[] = [input.org_id];

      if (input.active_only) {
        conditions.push("active = true");
      }
      if (input.category) {
        params.push(input.category);
        conditions.push(`category = $${params.length}`);
      }

      const result = await pool.query(
        `SELECT id, title, description, category, task_type, risk_class, template_text, variables, version, active, created_at
         FROM prompt_template
         WHERE ${conditions.join(" AND ")}
         ORDER BY category, title`,
        params
      );
      return result.rows;
    }),

  get: publicProcedure
    .input(z.object({ id: z.string().guid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM prompt_template WHERE id = $1`,
        [input.id]
      );
      return result.rows[0] ?? null;
    }),

  render: publicProcedure
    .input(
      z.object({
        template_id: z.string().guid(),
        values: z.record(z.string(), z.string()),
      })
    )
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT template_text, variables, task_type, risk_class FROM prompt_template WHERE id = $1 AND active = true`,
        [input.template_id]
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

  deactivate: publicProcedure
    .input(z.object({ id: z.string().guid() }))
    .mutation(async ({ input }) => {
      await pool.query(
        `UPDATE prompt_template SET active = false, updated_at = now() WHERE id = $1`,
        [input.id]
      );
      return { deactivated: true };
    }),
});
