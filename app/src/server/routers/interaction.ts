import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../trpc/init";
import {
  computeRowHash,
  computeContentHash,
  CURRENT_HASH_SCHEMA_VERSION,
  type HashableInteraction,
} from "@/lib/hash";
import { maskPii } from "@/lib/pii-masker";

const captureInput = z.object({
  provider: z.string(),
  model: z.string(),
  task_type: z.string(),
  risk_class: z.enum(["excessivo", "alto", "moderado", "baixo"]),
  prompt_original: z.string(),
  prompt_masked: z.string(),
  response_original: z.string().nullable(),
  response_masked: z.string().nullable(),
  policy_id: z.string().guid(),
  // Mesma taxonomia da CHECK constraint em ai_interaction.decision e do risk-engine.
  decision: z.enum(["allow", "allow_with_masking", "require_approval", "block"]),
  pii_technique: z.record(z.string(), z.string()).nullable().optional(),
  injection_flags: z.any().nullable().optional(),
  checklist_passed: z.boolean(),
  citations: z.any().nullable().optional(),
  token_map_ciphertext: z.string().nullable().optional(),
  token_map_wrapped_key: z.string().nullable().optional(),
});

export const interactionRouter = router({
  capture: protectedProcedure.input(captureInput).mutation(async ({ ctx, input }) => {
    // Fail-closed: o "masked" que chega ao núcleo não pode conter PII detectável.
    // O mascaramento é responsabilidade da borda; aqui apenas verificamos o resultado.
    // A checagem é deliberadamente regex-only (determinística e barata): a
    // indisponibilidade do NER (LLM) nunca pode rejeitar uma captura legítima.
    if (maskPii(input.prompt_masked).matches.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "prompt_masked contém PII não mascarado.",
      });
    }
    if (input.response_masked && maskPii(input.response_masked).matches.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "response_masked contém PII não mascarado.",
      });
    }

    const orgId = ctx.orgId;
    const db = ctx.db!;

    // Advisory lock por org para serializar a cadeia de hash. Transação é a que
    // já foi aberta pelo middleware protectedProcedure (withOrgContext) — não
    // abrimos uma nova aqui, só reaproveitamos a mesma conexão/transação.
    const lockKey = Buffer.from(orgId.replace(/-/g, ""), "hex");
    const lockId = lockKey.readInt32BE(0);
    await db.query("SELECT pg_advisory_xact_lock($1)", [lockId]);

    // Buscar último seq e prev_hash do tenant
    const lastRow = await db.query(
      `SELECT seq, row_hash FROM ai_interaction
       WHERE org_id = $1 ORDER BY seq DESC LIMIT 1`,
      [orgId]
    );

    const seq = lastRow.rows.length > 0 ? Number(lastRow.rows[0].seq) + 1 : 1;
    const prevHash: Buffer | null =
      lastRow.rows.length > 0 ? lastRow.rows[0].row_hash : null;

    const salt = orgId;
    const promptOrigHash = computeContentHash(input.prompt_original, salt);
    const responseOrigHash = input.response_original
      ? computeContentHash(input.response_original, salt)
      : null;

    const now = new Date().toISOString();

    const hashable: HashableInteraction = {
      org_id: orgId,
      seq,
      user_id: ctx.userId,
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
      hash_schema_version: CURRENT_HASH_SCHEMA_VERSION,
    };

    const rowHash = computeRowHash(hashable, prevHash);

    const result = await db.query(
      `INSERT INTO ai_interaction (
        org_id, seq, user_id, provider, model, task_type, risk_class,
        prompt_masked, response_masked, prompt_orig_hash, response_orig_hash,
        policy_id, decision, pii_technique, injection_flags,
        checklist_passed, citations, prev_hash, row_hash, created_at, hash_schema_version
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21
      ) RETURNING id`,
      [
        orgId, seq, ctx.userId, input.provider, input.model,
        input.task_type, input.risk_class,
        input.prompt_masked, input.response_masked,
        promptOrigHash, responseOrigHash,
        input.policy_id, input.decision,
        input.pii_technique ? JSON.stringify(input.pii_technique) : null,
        input.injection_flags ? JSON.stringify(input.injection_flags) : null,
        input.checklist_passed,
        input.citations ? JSON.stringify(input.citations) : null,
        prevHash, rowHash, now, CURRENT_HASH_SCHEMA_VERSION,
      ]
    );

    const interactionId = result.rows[0].id;

    if (input.token_map_ciphertext && input.token_map_wrapped_key) {
      await db.query(
        `INSERT INTO token_map (interaction_id, org_id, ciphertext, wrapped_data_key)
         VALUES ($1, $2, $3, $4)`,
        [
          interactionId,
          orgId,
          Buffer.from(input.token_map_ciphertext, "base64"),
          Buffer.from(input.token_map_wrapped_key, "base64"),
        ]
      );
    }

    return { id: interactionId, seq, row_hash: rowHash.toString("hex") };
  }),

  list: protectedProcedure
    .input(z.object({ org_id: z.string().guid().optional(), limit: z.number().int().max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db!.query(
        `SELECT id, seq, user_id, provider, model, task_type, risk_class,
                decision, checklist_passed, created_at
         FROM ai_interaction
         WHERE org_id = $1
         ORDER BY seq DESC
         LIMIT $2`,
        [ctx.orgId, input.limit]
      );
      return result.rows;
    }),

  verifyChain: protectedProcedure
    .input(z.object({ org_id: z.string().guid().optional() }).optional())
    .query(async ({ ctx }) => {
      const result = await ctx.db!.query(
        `SELECT seq, org_id, user_id, provider, model, task_type, risk_class,
                prompt_masked, response_masked,
                encode(prompt_orig_hash, 'hex') as prompt_orig_hash,
                encode(response_orig_hash, 'hex') as response_orig_hash,
                decision, checklist_passed, citations, created_at,
                prev_hash, row_hash, hash_schema_version
         FROM ai_interaction
         WHERE org_id = $1
         ORDER BY seq ASC`,
        [ctx.orgId]
      );

      if (result.rows.length === 0) {
        return { valid: true, checked: 0, errors: [] };
      }

      const errors: { seq: number; reason: string }[] = [];

      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows[i];
        const prevHash: Buffer | null = i > 0 ? result.rows[i - 1].row_hash : null;

        if (row.hash_schema_version !== CURRENT_HASH_SCHEMA_VERSION) {
          errors.push({
            seq: Number(row.seq),
            reason: `hash_schema_version ${row.hash_schema_version} não suportado por esta função de verificação`,
          });
          continue;
        }

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
          hash_schema_version: row.hash_schema_version,
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
