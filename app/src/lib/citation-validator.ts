import type { ExtractedCitation } from "./citation-extractor";
import type { SemanticJudgeFn } from "./semantic-judge";

export interface ValidationResult {
  raw_text: string;
  cite_type: string;
  canonical_key: string | null;
  status: "confirmada" | "divergente" | "desatualizada" | "nao_localizada" | "nao_verificavel";
  source: string | null;
  source_ref: string | null;
  evidence_excerpt: string | null;
  confidence: number | null;
}

export interface SourceLookupResult {
  found: boolean;
  source: string;
  source_ref: string | null;
  content: string | null;
  revoked: boolean;
}

export type SourceLookupFn = (
  canonicalKey: string,
  citeType: string
) => Promise<SourceLookupResult | null>;

export interface ValidateOptions {
  /**
   * Juiz semântico (eixo 2 — conteúdo): compara a tese alegada no documento
   * com o texto oficial recuperado. Opcional: sem juiz, "confirmada" atesta
   * apenas EXISTÊNCIA na fonte oficial (comportamento anterior).
   */
  judge?: SemanticJudgeFn;
  /** Texto completo do documento — usado para extrair a tese ao redor da citação. */
  fullText?: string;
}

/** Janela de contexto ao redor da citação — a "tese alegada" que o juiz avalia. */
const CLAIM_CONTEXT_WINDOW = 300;

function extractClaimContext(citation: ExtractedCitation, fullText: string): string {
  const start = Math.max(0, citation.start - CLAIM_CONTEXT_WINDOW);
  const end = Math.min(fullText.length, citation.end + CLAIM_CONTEXT_WINDOW);
  return fullText.slice(start, end).trim();
}

export async function validateCitation(
  citation: ExtractedCitation,
  lookupSource: SourceLookupFn,
  opts: ValidateOptions = {}
): Promise<ValidationResult> {
  if (!citation.canonical_key) {
    return {
      raw_text: citation.raw_text,
      cite_type: citation.cite_type,
      canonical_key: null,
      status: "nao_verificavel",
      source: null,
      source_ref: null,
      evidence_excerpt: null,
      confidence: null,
    };
  }

  const result = await lookupSource(citation.canonical_key, citation.cite_type);

  if (!result) {
    return {
      raw_text: citation.raw_text,
      cite_type: citation.cite_type,
      canonical_key: citation.canonical_key,
      status: "nao_verificavel",
      source: null,
      source_ref: null,
      evidence_excerpt: null,
      confidence: null,
    };
  }

  // Eixo 1: Existência
  if (!result.found) {
    return {
      raw_text: citation.raw_text,
      cite_type: citation.cite_type,
      canonical_key: citation.canonical_key,
      status: "nao_localizada",
      source: result.source,
      source_ref: result.source_ref,
      evidence_excerpt: null,
      confidence: 0.9,
    };
  }

  // Eixo 3: Vigência
  if (result.revoked) {
    return {
      raw_text: citation.raw_text,
      cite_type: citation.cite_type,
      canonical_key: citation.canonical_key,
      status: "desatualizada",
      source: result.source,
      source_ref: result.source_ref,
      evidence_excerpt: result.content,
      confidence: 0.85,
    };
  }

  // Eixo 2: Conteúdo — sem conteúdo recuperado, não emitir confirmada
  if (!result.content) {
    return {
      raw_text: citation.raw_text,
      cite_type: citation.cite_type,
      canonical_key: citation.canonical_key,
      status: "nao_verificavel",
      source: result.source,
      source_ref: result.source_ref,
      evidence_excerpt: null,
      confidence: null,
    };
  }

  // Eixo 2: Conteúdo — juiz semântico compara tese alegada × texto oficial.
  // O juiz recebe SÓ o texto oficial recuperado (invariante 3) e responde em
  // esquema fechado. "insuficiente" (ou juiz ausente/falho) mantém a
  // confirmação por EXISTÊNCIA — nunca rebaixa nem eleva por inferência.
  if (opts.judge && opts.fullText) {
    const claimContext = extractClaimContext(citation, opts.fullText);
    // Só julga se há tese alegada além da própria referência (contexto maior
    // que a citação em si) — uma citação "solta" não tem o que comparar.
    if (claimContext.length > citation.raw_text.length + 20) {
      const verdict = await opts.judge({
        citation: citation.raw_text,
        claimContext,
        officialText: result.content,
      });

      if (verdict.verdict === "divergente") {
        return {
          raw_text: citation.raw_text,
          cite_type: citation.cite_type,
          canonical_key: citation.canonical_key,
          status: "divergente",
          source: result.source,
          source_ref: result.source_ref,
          evidence_excerpt: result.content,
          confidence: 0.85,
        };
      }

      if (verdict.verdict === "consistente") {
        return {
          raw_text: citation.raw_text,
          cite_type: citation.cite_type,
          canonical_key: citation.canonical_key,
          status: "confirmada",
          source: result.source,
          source_ref: result.source_ref,
          evidence_excerpt: result.content,
          confidence: 0.98,
        };
      }
      // "insuficiente" cai no retorno padrão abaixo (confirmada por existência).
    }
  }

  // Confirmada por existência na fonte oficial (eixo 1 + vigência).
  return {
    raw_text: citation.raw_text,
    cite_type: citation.cite_type,
    canonical_key: citation.canonical_key,
    status: "confirmada",
    source: result.source,
    source_ref: result.source_ref,
    evidence_excerpt: result.content,
    confidence: 0.95,
  };
}

export async function validateAllCitations(
  citations: ExtractedCitation[],
  lookupSource: SourceLookupFn,
  opts: ValidateOptions = {}
): Promise<ValidationResult[]> {
  const seen = new Set<string>();
  const deduped = citations.filter((c) => {
    const key = c.canonical_key ?? c.raw_text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return Promise.all(deduped.map((c) => validateCitation(c, lookupSource, opts)));
}
