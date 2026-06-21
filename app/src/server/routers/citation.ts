import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";
import { extractCitations } from "@/lib/citation-extractor";
import { validateAllCitations, type SourceLookupFn, type SourceLookupResult } from "@/lib/citation-validator";

const stubLookup: SourceLookupFn = async (canonicalKey, citeType) => {
  // Em produção: consultar DATAJUD, STF, STJ, LexML, Planalto
  // Stub: verificar no cache local se existe
  const cached = await pool.query(
    `SELECT payload, fetched_at, ttl_seconds FROM source_cache WHERE canonical_key = $1`,
    [canonicalKey]
  );

  if (cached.rows.length > 0) {
    const row = cached.rows[0];
    const age = (Date.now() - new Date(row.fetched_at).getTime()) / 1000;
    if (age < row.ttl_seconds) {
      const payload = row.payload as { found: boolean; content: string | null; revoked: boolean; source_ref: string | null };
      return {
        found: payload.found,
        source: citeType === "legislacao" ? "Planalto" : "STJ/STF",
        source_ref: payload.source_ref,
        content: payload.content,
        revoked: payload.revoked,
      };
    }
  }

  return null;
};

export const citationRouter = router({
  extract: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return extractCitations(input.text);
    }),

  validate: publicProcedure
    .input(
      z.object({
        org_id: z.string().uuid(),
        interaction_id: z.string().uuid(),
        response_text: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const citations = extractCitations(input.response_text);
      const results = await validateAllCitations(citations, stubLookup);

      for (const r of results) {
        await pool.query(
          `INSERT INTO citation_check (interaction_id, org_id, raw_text, cite_type, canonical_key, status, source, source_ref, evidence_excerpt, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            input.interaction_id, input.org_id,
            r.raw_text, r.cite_type, r.canonical_key,
            r.status, r.source, r.source_ref,
            r.evidence_excerpt, r.confidence,
          ]
        );
      }

      return {
        total: results.length,
        by_status: {
          confirmada: results.filter((r) => r.status === "confirmada").length,
          divergente: results.filter((r) => r.status === "divergente").length,
          desatualizada: results.filter((r) => r.status === "desatualizada").length,
          nao_localizada: results.filter((r) => r.status === "nao_localizada").length,
          nao_verificavel: results.filter((r) => r.status === "nao_verificavel").length,
        },
        citations: results,
      };
    }),

  cacheSource: publicProcedure
    .input(
      z.object({
        canonical_key: z.string(),
        payload: z.object({
          found: z.boolean(),
          content: z.string().nullable(),
          revoked: z.boolean(),
          source_ref: z.string().nullable(),
        }),
        ttl_seconds: z.number().int().default(86400),
      })
    )
    .mutation(async ({ input }) => {
      await pool.query(
        `INSERT INTO source_cache (canonical_key, payload, fetched_at, ttl_seconds)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (canonical_key) DO UPDATE SET payload = $2, fetched_at = now(), ttl_seconds = $3`,
        [input.canonical_key, JSON.stringify(input.payload), input.ttl_seconds]
      );
      return { cached: true };
    }),

  listByInteraction: publicProcedure
    .input(z.object({ interaction_id: z.string().uuid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM citation_check WHERE interaction_id = $1 ORDER BY checked_at`,
        [input.interaction_id]
      );
      return result.rows;
    }),
});
