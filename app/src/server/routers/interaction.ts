import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";
import { computeRowHash, computeContentHash, type HashableInteraction } from "@/lib/hash";

const captureInput = z.object({
  org_id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: z.string(),
  model: z.string(),
  task_type: z.string(),
  risk_class: z.enum(["excessivo", "alto", "moderado", "baixo"]),
  prompt_original: z.string(),
  prompt_masked: z.string(),
  response_original: z.string().nullable(),
  response_masked: z.string().nullable(),
  policy_id: z.string().uuid(),
  decision: z.enum(["allow", "masked", "approval", "block"]),
  pii_technique: z.record(z.string(), z.string()).nullable().optional(),
  injection_flags: z.any().nullable().optional(),
  checklist_passed: z.boolean(),
  citations: z.any().nullable().optional(),
  token_map_ciphertext: z.string().nullable().optional(),
  token_map_wrapped_key: z.string().nullable().optional(),
});

export const interactionRouter = router({
  capture: publicProcedure.input(captureInput).mutation(async ({ input }) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Advisory lock por org para serializar a cadeia de hash
      const lockKey = Buffer.from(input.org_id.replace(/-/g, ""), "hex");
      const lockId = lockKey.readInt32BE(0);
      await client.query("SELECT pg_advisory_xact_lock($1)", [lockId]);

      // Buscar último seq e prev_hash do tenant
      const lastRow = await client.query(
        `SELECT seq, row_hash FROM ai_interaction
         WHERE org_id = $1 ORDER BY seq DESC LIMIT 1`,
        [input.org_id]
      );

      const seq = lastRow.rows.length > 0 ? Number(lastRow.rows[0].seq) + 1 : 1;
      const prevHash: Buffer | null =
        lastRow.rows.length > 0 ? lastRow.rows[0].row_hash : null;

      const salt = input.org_id;
      const promptOrigHash = computeContentHash(input.prompt_original, salt);
      const responseOrigHash = input.response_original
        ? computeContentHash(input.response_original, salt)
        : null;

      const now = new Date().toISOString();

      const hashable: HashableInteraction = {
        org_id: input.org_id,
        seq,
        user_id: input.user_id,
        provider: input.provider,
        model: input.model,
        task_type: input.task_type,
        risk_class: input.risk_class,
        prompt_masked: input.prompt_masked,
        response_masked: input.response_masked,
        prompt_orig_hash: promptOrigHash.toString("hex"),
        response_orig_hash: responseOrigHash?.toString("hex") ?? null,
        decision: input.decision,
        checklist_passed: input.checklist_passed,
        citations: input.citations ?? null,
        created_at: now,
      };

      const rowHash = computeRowHash(hashable, prevHash);

      const result = await client.query(
        `INSERT INTO ai_interaction (
          org_id, seq, user_id, provider, model, task_type, risk_class,
          prompt_masked, response_masked, prompt_orig_hash, response_orig_hash,
          policy_id, decision, pii_technique, injection_flags,
          checklist_passed, citations, prev_hash, row_hash, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19, $20
        ) RETURNING id`,
        [
          input.org_id, seq, input.user_id, input.provider, input.model,
          input.task_type, input.risk_class,
          input.prompt_masked, input.response_masked,
          promptOrigHash, responseOrigHash,
          input.policy_id, input.decision,
          input.pii_technique ? JSON.stringify(input.pii_technique) : null,
          input.injection_flags ? JSON.stringify(input.injection_flags) : null,
          input.checklist_passed,
          input.citations ? JSON.stringify(input.citations) : null,
          prevHash, rowHash, now,
        ]
      );

      const interactionId = result.rows[0].id;

      if (input.token_map_ciphertext && input.token_map_wrapped_key) {
        await client.query(
          `INSERT INTO token_map (interaction_id, org_id, ciphertext, wrapped_data_key)
           VALUES ($1, $2, $3, $4)`,
          [
            interactionId,
            input.org_id,
            Buffer.from(input.token_map_ciphertext, "base64"),
            Buffer.from(input.token_map_wrapped_key, "base64"),
          ]
        );
      }

      await client.query("COMMIT");

      return { id: interactionId, seq, row_hash: rowHash.toString("hex") };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),

  list: publicProcedure
    .input(z.object({ org_id: z.string().uuid(), limit: z.number().int().max(100).default(50) }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT id, seq, user_id, provider, model, task_type, risk_class,
                decision, checklist_passed, created_at
         FROM ai_interaction
         WHERE org_id = $1
         ORDER BY seq DESC
         LIMIT $2`,
        [input.org_id, input.limit]
      );
      return result.rows;
    }),

  verifyChain: publicProcedure
    .input(z.object({ org_id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT seq, org_id, user_id, provider, model, task_type, risk_class,
                prompt_masked, response_masked,
                encode(prompt_orig_hash, 'hex') as prompt_orig_hash,
                encode(response_orig_hash, 'hex') as response_orig_hash,
                decision, checklist_passed, citations, created_at,
                prev_hash, row_hash
         FROM ai_interaction
         WHERE org_id = $1
         ORDER BY seq ASC`,
        [input.org_id]
      );

      if (result.rows.length === 0) {
        return { valid: true, checked: 0, errors: [] };
      }

      const errors: { seq: number; reason: string }[] = [];

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        const prevHash: Buffer | null = i > 0 ? result.rows[i - 1].row_hash : null;

        const hashable: HashableInteraction = {
          org_id: row.org_id,
          seq: Number(row.seq),
          user_id: row.user_id,
          provider: row.provider,
          model: row.model,
          task_type: row.task_type,
          risk_class: row.risk_class,
          prompt_masked: row.prompt_masked,
          response_masked: row.response_masked,
          prompt_orig_hash: row.prompt_orig_hash,
          response_orig_hash: row.response_orig_hash,
          decision: row.decision,
          checklist_passed: row.checklist_passed,
          citations: row.citations,
          created_at:
            row.created_at instanceof Date
              ? row.created_at.toISOString()
              : row.created_at,
        };

        const expected = computeRowHash(hashable, prevHash);

        if (!expected.equals(row.row_hash)) {
          errors.push({ seq: Number(row.seq), reason: "hash divergente" });
        }

        if (i > 0 && row.prev_hash) {
          if (!Buffer.from(row.prev_hash).equals(result.rows[i - 1].row_hash)) {
            errors.push({ seq: Number(row.seq), reason: "prev_hash não bate com registro anterior" });
          }
        }
      }

      return { valid: errors.length === 0, checked: result.rows.length, errors };
    }),
});
