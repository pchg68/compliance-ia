import { describe, it, expect } from "vitest";
import { extractCitations } from "../src/lib/citation-extractor";

describe("Extrator de citações jurídicas", () => {
  it("extrai artigo do CPC", () => {
    const cites = extractCitations("Conforme art. 489 do CPC, a sentença deve ser fundamentada.");
    expect(cites.length).toBeGreaterThanOrEqual(1);
    const cpc = cites.find((c) => c.canonical_key?.includes("13105"));
    expect(cpc).toBeTruthy();
    expect(cpc!.cite_type).toBe("legislacao");
  });

  it("extrai artigo da CF", () => {
    const cites = extractCitations("O art. 5º da CF garante o direito à privacidade.");
    const cf = cites.find((c) => c.canonical_key?.includes("cf:1988"));
    expect(cf).toBeTruthy();
  });

  it("extrai lei por número", () => {
    const cites = extractCitations("A Lei 11.101/2005 regula a recuperação judicial.");
    expect(cites.some((c) => c.cite_type === "legislacao")).toBe(true);
  });

  it("extrai súmula do STJ", () => {
    const cites = extractCitations("Conforme Súmula 7/STJ, reexame de prova é vedado.");
    const sumula = cites.find((c) => c.cite_type === "sumula");
    expect(sumula).toBeTruthy();
    expect(sumula!.canonical_key).toBe("stj:sumula:7");
  });

  it("extrai súmula vinculante", () => {
    const cites = extractCitations("A Súmula Vinculante 10 do STF veda...");
    const sv = cites.find((c) => c.canonical_key?.includes("sumula_vinculante"));
    expect(sv).toBeTruthy();
  });

  it("extrai REsp", () => {
    const cites = extractCitations("No REsp 1.234.567/SP, o STJ decidiu...");
    const resp = cites.find((c) => c.cite_type === "precedente");
    expect(resp).toBeTruthy();
    expect(resp!.canonical_key).toContain("stj:resp:");
  });

  it("extrai RE", () => {
    const cites = extractCitations("No RE 1058333, o STF...");
    const re = cites.find((c) => c.cite_type === "precedente");
    expect(re).toBeTruthy();
    expect(re!.canonical_key).toContain("stf:re:");
  });

  it("extrai número CNJ de processo", () => {
    const cites = extractCitations("Autos 0001234-56.2026.8.16.0001.");
    const cnj = cites.find((c) => c.canonical_key?.startsWith("cnj:"));
    expect(cnj).toBeTruthy();
  });

  it("extrai tema repetitivo do STJ", () => {
    const cites = extractCitations("Conforme Tema 1095/STJ...");
    const tema = cites.find((c) => c.cite_type === "tema");
    expect(tema).toBeTruthy();
    expect(tema!.canonical_key).toBe("stj:tema:1095");
  });

  it("extrai tema de repercussão geral", () => {
    const cites = extractCitations("O Tema 952 RG define...");
    const tema = cites.find((c) => c.cite_type === "tema");
    expect(tema).toBeTruthy();
    expect(tema!.canonical_key).toContain("stf:tema:");
  });

  it("extrai múltiplas citações no mesmo texto", () => {
    const text = `
      Conforme art. 489 do CPC e Súmula 7/STJ, o tribunal decidiu no
      REsp 1.234.567/SP que o Tema 1095/STJ se aplica.
    `;
    const cites = extractCitations(text);
    expect(cites.length).toBeGreaterThanOrEqual(3);
  });

  it("texto sem citações retorna vazio", () => {
    const cites = extractCitations("Este texto não possui nenhuma referência jurídica.");
    expect(cites).toHaveLength(0);
  });
});
