/**
 * Conector de súmulas (STJ/STF) contra a base local sumula_oficial.
 * Consulta interna (não rede) — escalável para alto volume de validações.
 * Invariante 3/6: só confirma o que está na base oficial ingerida; o resto
 * permanece não-verificável (nunca afirma existência por inferência).
 */

import { pool } from "@/lib/db";
import type { SourceLookupResult } from "@/lib/citation-validator";

/** Reconhece chaves como "stj:sumula:7", "stf:sumula_vinculante:10". */
export function isSumulaKey(canonicalKey: string): boolean {
  return /^(stj|stf):sumula(_vinculante)?:\d+$/.test(canonicalKey);
}

export async function sumulaLookup(
  canonicalKey: string
): Promise<SourceLookupResult | null> {
  if (!isSumulaKey(canonicalKey)) return null;

  const result = await pool.query(
    `SELECT tribunal, numero, vinculante, texto, revogada, source_ref
     FROM sumula_oficial
     WHERE canonical_key = $1
     LIMIT 1`,
    [canonicalKey]
  );

  const sourceName = canonicalKey.startsWith("stf") ? "STF" : "STJ";

  if (result.rows.length === 0) {
    return {
      found: false,
      source: sourceName,
      source_ref: null,
      content: null,
      revoked: false,
    };
  }

  const row = result.rows[0];
  return {
    found: true,
    source: sourceName,
    source_ref: row.source_ref,
    content: row.texto, // texto oficial recuperado — nunca inferido
    revoked: row.revogada,
  };
}
