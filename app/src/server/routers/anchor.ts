import { z } from "zod/v4";
import { protectedProcedure, router } from "../trpc/init";
import { buildMerkleTree } from "@/lib/merkle";
import { requestTimestamp, verifyTimestamp } from "@/lib/tsa-stub";

export const anchorRouter = router({
  createEpoch: protectedProcedure
    .input(
      z.object({
        from_seq: z.number().int(),
        to_seq: z.number().int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const orgId = ctx.orgId;
      const rows = await ctx.db!.query(
        `SELECT seq, row_hash FROM ai_interaction
         WHERE org_id = $1 AND seq >= $2 AND seq <= $3
         ORDER BY seq ASC`,
        [orgId, input.from_seq, input.to_seq]
      );

      if (rows.rows.length === 0) {
        throw new Error("Nenhum registro encontrado no intervalo");
      }

      const leaves = rows.rows.map((r: { row_hash: Buffer }) => r.row_hash);
      const { root } = buildMerkleTree(leaves);
      const tsaToken = requestTimestamp(root);

      const result = await ctx.db!.query(
        `INSERT INTO audit_anchor (org_id, epoch_from_seq, epoch_to_seq, merkle_root, tsa_token, anchored_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          orgId, input.from_seq, input.to_seq,
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

  verify: protectedProcedure
    .input(
      z.object({
        anchor_id: z.string().guid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const orgId = ctx.orgId;
      const anchor = await ctx.db!.query(
        `SELECT * FROM audit_anchor WHERE id = $1 AND org_id = $2`,
        [input.anchor_id, orgId]
      );

      if (anchor.rows.length === 0) {
        throw new Error("Âncora não encontrada");
      }

      const a = anchor.rows[0];

      const rows = await ctx.db!.query(
        `SELECT seq, row_hash FROM ai_interaction
         WHERE org_id = $1 AND seq >= $2 AND seq <= $3
         ORDER BY seq ASC`,
        [orgId, a.epoch_from_seq, a.epoch_to_seq]
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

  latest: protectedProcedure.query(async ({ ctx }) => {
      const result = await ctx.db!.query(
        `SELECT id, epoch_from_seq, epoch_to_seq, encode(merkle_root, 'hex') as merkle_root, anchored_at
         FROM audit_anchor WHERE org_id = $1
         ORDER BY anchored_at DESC LIMIT 1`,
        [ctx.orgId]
      );
      return result.rows[0] ?? null;
    }),
});
