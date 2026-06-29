import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { pool } from "@/lib/db";
import { extractCitations } from "@/lib/citation-extractor";
import { validateAllCitations, type SourceLookupFn, type ValidationResult } from "@/lib/citation-validator";
import { lookupMany } from "@/lib/source-registry";

/**
 * Constrói um SourceLookupFn que lê de um mapa já resolvido (prefetch).
 * Mantém a lógica dos 3 eixos centralizada em validateCitation, mas sem
 * disparar chamadas externas durante a validação — todas já foram feitas
 * em lote com dedup + concorrência limitada.
 */
function lookupFromMap(map: Map<string, ReturnType<typeof Object> | unknown>): SourceLookupFn {
  return async (canonicalKey) => {
    const r = map.get(canonicalKey);
    return (r as Awaited<ReturnType<SourceLookupFn>>) ?? null;
  };
}

async function persistChecks(
  interactionId: string,
  orgId: string,
  results: ValidationResult[]
) {
  if (results.length === 0) return;
  // Insert em lote (uma query) — escalável para peças com muitas citações.
  const cols = 10;
  const values: unknown[] = [];
  const tuples: string[] = [];
  results.forEach((r, i) => {
    const b = i * cols;
    tuples.push(
      `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`
    );
    values.push(
      interactionId, orgId, r.raw_text, r.cite_type, r.canonical_key,
      r.status, r.source, r.source_ref, r.evidence_excerpt, r.confidence
    );
  });
  await pool.query(
    `INSERT INTO citation_check
      (interaction_id, org_id, raw_text, cite_type, canonical_key, status, source, source_ref, evidence_excerpt, confidence)
     VALUES ${tuples.join(",")}`,
    values
  );
}

function summarize(results: ValidationResult[]) {
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
}

export const citationRouter = router({
  extract: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return extractCitations(input.text);
    }),

  /** Valida texto avulso (página do validador) sem persistir em trilha. */
  validateText: publicProcedure
    .input(z.object({ text: z.string().max(200_000), org_id: z.string().guid().nullable().optional() }))
    .mutation(async ({ input }) => {
      const citations = extractCitations(input.text);
      const map = await lookupMany(
        citations.map((c) => ({ canonicalKey: c.canonical_key ?? "", citeType: c.cite_type })),
        input.org_id ?? null
      );
      const results = await validateAllCitations(citations, lookupFromMap(map));
      return summarize(results);
    }),

  /** Valida e persiste na trilha, vinculado a uma interação. */
  validate: publicProcedure
    .input(
      z.object({
        org_id: z.string().guid(),
        interaction_id: z.string().guid(),
        response_text: z.string().max(200_000),
      })
    )
    .mutation(async ({ input }) => {
      const citations = extractCitations(input.response_text);
      const map = await lookupMany(
        citations.map((c) => ({ canonicalKey: c.canonical_key ?? "", citeType: c.cite_type })),
        input.org_id
      );
      const results = await validateAllCitations(citations, lookupFromMap(map));
      await persistChecks(input.interaction_id, input.org_id, results);
      return summarize(results);
    }),

  listByInteraction: publicProcedure
    .input(z.object({ interaction_id: z.string().guid() }))
    .query(async ({ input }) => {
      const result = await pool.query(
        `SELECT * FROM citation_check WHERE interaction_id = $1 ORDER BY checked_at`,
        [input.interaction_id]
      );
      return result.rows;
    }),
});
