import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";
import { buildMerkleTree, getMerkleProof, verifyMerkleProof, sha256 } from "@/lib/merkle";
import { requestTimestamp, verifyTimestamp } from "@/lib/tsa-stub";

export const anchorRouter = router({
  createEpoch: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        from_seq: z.number().int(),
        to_seq: z.number().int(),
      })
    )
    .mutation(async ({ input }) => {
      const rows = await pool.query(
        `SELECT seq, row_hash FROM ai_interaction
         WHERE org_id = $1 AND seq >= $2 AND seq <= $3
         ORDER BY seq ASC`,
        [input.org_id, input.from_seq, input.to_seq]
      );

      if (rows.rows.length === 0) {
        throw new Error("Nenhum registro encontrado no intervalo");
      }

      const leaves = rows.rows.map((r: { row_hash: Buffer }) => r.row_hash);
      const { root } = buildMerkleTree(leaves);
      const tsaToken = requestTimestamp(root);

      const result = await pool.query(
        `INSERT INTO audit_anchor (org_id, epoch_from_seq, epoch_to_seq, merkle_root, tsa_token, anchored_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          input.org_id, input.from_seq, input.to_seq,
          root, tsaToken.token, tsaToken.timestamp,
        ]
      );

      return {
        id: result.rows[0].id,
        merkle_root: root.toString("hex"),
        records_count: rows.rows.length,
        anchored_at: tsaToken.timestamp,
        tsa_stub: true,
      };
    }),

  verify: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        anchor_id: z.string().guid(),
      })
    )
    .query(async ({ input }) => {
      const anchor = await pool.query(
        `SELECT * FROM audit_anchor WHERE id = $1 AND org_id = $2`,
        [input.anchor_id, input.org_id]
      );

      if (anchor.rows.length === 0) {
        throw new Error("Âncora não encontrada");
      }

      const a = anchor.rows[0];

      const rows = await pool.query(
        `SELECT seq, row_hash FROM ai_interaction
         WHERE org_id = $1 AND seq >= $2 AND seq <= $3
         ORDER BY seq ASC`,
        [input.org_id, a.epoch_from_seq, a.epoch_to_seq]
      );

      const leaves = rows.rows.map((r: { row_hash: Buffer }) => r.row_hash);
      const { root } = buildMerkleTree(leaves);

      const rootMatch = root.equals(a.merkle_root);
      const tsaValid = verifyTimestamp(
        a.merkle_root,
        a.anchored_at instanceof Date ? a.anchored_at.toISOString() : a.anchored_at,
        a.tsa_token
      );

      return {
        anchor_id: input.anchor_id,
        root_match: rootMatch,
        tsa_valid: tsaValid,
        valid: rootMatch && tsaValid,
        records_checked: rows.rows.length,
        epoch: { from: a.epoch_from_seq, to: a.epoch_to_seq },
      };
    }),

  latest: publicProcedure
    .input(z.object({ org_id: z.string().guid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT id, epoch_from_seq, epoch_to_seq, encode(merkle_root, 'hex') as merkle_root, anchored_at
         FROM audit_anchor WHERE org_id = $1
         ORDER BY anchored_at DESC LIMIT 1`,
        [input.org_id]
      );
      return result.rows[0] ?? null;
    }),
});
