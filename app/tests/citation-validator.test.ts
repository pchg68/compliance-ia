import { describe, it, expect } from "vitest";
import { validateCitation, validateAllCitations, type SourceLookupFn } from "../src/lib/citation-validator";
import type { ExtractedCitation } from "../src/lib/citation-extractor";

const mockLookup: SourceLookupFn = async (canonicalKey) => {
  const db: Record<string, { found: boolean; content: string | null; revoked: boolean; source_ref: string | null }> = {
    "br:federal:lei:13105/2015!art489": {
      found: true,
      content: "São elementos essenciais da sentença: I - o relatório...",
      revoked: false,
      source_ref: "https://planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm",
    },
    "stj:sumula:7": {
      found: true,
      content: "A pretensão de simples reexame de prova não enseja recurso especial.",
      revoked: false,
      source_ref: "https://scon.stj.jus.br/SCON/sumulas/doc.jsp?livre=7",
    },
    "stj:resp:9999999": {
      found: false,
      content: null,
      revoked: false,
      source_ref: null,
    },
    "br:federal:lei:revogada": {
      found: true,
      content: "Texto da lei revogada",
      revoked: true,
      source_ref: "https://planalto.gov.br/lei-revogada",
    },
    "stj:resp:sem_conteudo": {
      found: true,
      content: null,
      revoked: false,
      source_ref: "https://stj.jus.br/resp/sem-conteudo",
    },
  };

  const entry = db[canonicalKey];
  if (!entry) return null;

  return {
    found: entry.found,
    source: canonicalKey.startsWith("stj") ? "STJ" : "Planalto",
    source_ref: entry.source_ref,
    content: entry.content,
    revoked: entry.revoked,
  };
};

describe("Validador de citações — 3 eixos", () => {
  it("confirma citação existente, com conteúdo, vigente", async () => {
    const cite: ExtractedCitation = {
      raw_text: "art. 489 do CPC",
      cite_type: "legislacao",
      canonical_key: "br:federal:lei:13105/2015!art489",
      start: 0, end: 15,
    };
    const result = await validateCitation(cite, mockLookup);
    expect(result.status).toBe("confirmada");
    expect(result.evidence_excerpt).toBeTruthy();
    expect(result.source).toBe("Planalto");
  });

  it("marca como nao_localizada quando não encontra na fonte", async () => {
    const cite: ExtractedCitation = {
      raw_text: "REsp 9.999.999/SP",
      cite_type: "precedente",
      canonical_key: "stj:resp:9999999",
      start: 0, end: 17,
    };
    const result = await validateCitation(cite, mockLookup);
    expect(result.status).toBe("nao_localizada");
  });

  it("marca como desatualizada quando lei é revogada", async () => {
    const cite: ExtractedCitation = {
      raw_text: "Lei revogada",
      cite_type: "legislacao",
      canonical_key: "br:federal:lei:revogada",
      start: 0, end: 12,
    };
    const result = await validateCitation(cite, mockLookup);
    expect(result.status).toBe("desatualizada");
  });

  it("marca como nao_verificavel quando sem canonical_key", async () => {
    const cite: ExtractedCitation = {
      raw_text: "entendimento consolidado do STJ",
      cite_type: "precedente",
      canonical_key: null,
      start: 0, end: 30,
    };
    const result = await validateCitation(cite, mockLookup);
    expect(result.status).toBe("nao_verificavel");
  });

  it("marca como nao_verificavel quando fonte indisponível", async () => {
    const cite: ExtractedCitation = {
      raw_text: "Tema 9999/STJ",
      cite_type: "tema",
      canonical_key: "stj:tema:9999",
      start: 0, end: 13,
    };
    const result = await validateCitation(cite, mockLookup);
    expect(result.status).toBe("nao_verificavel");
  });

  it("marca como nao_verificavel quando existe mas sem conteúdo", async () => {
    const cite: ExtractedCitation = {
      raw_text: "REsp sem conteúdo",
      cite_type: "precedente",
      canonical_key: "stj:resp:sem_conteudo",
      start: 0, end: 17,
    };
    const result = await validateCitation(cite, mockLookup);
    expect(result.status).toBe("nao_verificavel");
  });

  it("nunca marca como falso (princípio do validador)", async () => {
    const cites: ExtractedCitation[] = [
      { raw_text: "a", cite_type: "legislacao", canonical_key: "stj:resp:9999999", start: 0, end: 1 },
      { raw_text: "b", cite_type: "precedente", canonical_key: null, start: 2, end: 3 },
      { raw_text: "c", cite_type: "sumula", canonical_key: "inexistente", start: 4, end: 5 },
    ];
    const results = await validateAllCitations(cites, mockLookup);
    for (const r of results) {
      expect(r.status).not.toBe("falso");
    }
  });

  it("deduplica citações com mesma canonical_key", async () => {
    const cites: ExtractedCitation[] = [
      { raw_text: "art. 489 CPC", cite_type: "legislacao", canonical_key: "br:federal:lei:13105/2015!art489", start: 0, end: 12 },
      { raw_text: "art. 489 do CPC", cite_type: "legislacao", canonical_key: "br:federal:lei:13105/2015!art489", start: 20, end: 35 },
    ];
    const results = await validateAllCitations(cites, mockLookup);
    expect(results).toHaveLength(1);
  });
});
