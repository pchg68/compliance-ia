import type { ExtractedCitation } from "./citation-extractor";

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

export async function validateCitation(
  citation: ExtractedCitation,
  lookupSource: SourceLookupFn
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

  // Conteúdo disponível — marcar como confirmada
  // (em produção, aqui entraria o juiz semântico para comparar tese × ementa)
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
  lookupSource: SourceLookupFn
): Promise<ValidationResult[]> {
  const seen = new Set<string>();
  const deduped = citations.filter((c) => {
    const key = c.canonical_key ?? c.raw_text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return Promise.all(deduped.map((c) => validateCitation(c, lookupSource)));
}
