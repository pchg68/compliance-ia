import { describe, it, expect } from "vitest";
import { canonicalToUrn, isNotFoundPage, isAmbiguousPage } from "../src/lib/lexml-client";

describe("LexML — detecção de página 'não encontrada'", () => {
  it("detecta marcador de não encontrado", () => {
    expect(isNotFoundPage("<html><body>URN não encontrada</body></html>")).toBe(true);
    expect(isNotFoundPage("<html>nao encontrado</html>")).toBe(true);
  });

  it("página curta sem marcador NÃO é tratada como confirmadamente não encontrada", () => {
    // Tamanho sozinho é sinal fraco demais para afirmar ausência (invariante 3) —
    // isNotFoundPage exige o marcador textual; ver isAmbiguousPage para o caso incerto.
    expect(isNotFoundPage("<html>erro</html>")).toBe(false);
  });

  it("trata página grande de norma real como encontrada", () => {
    const big = "<html><title>Lei 13.105/2015</title>" + "x".repeat(6000) + "</html>";
    expect(isNotFoundPage(big)).toBe(false);
  });
});

describe("LexML — página ambígua (sinal fraco, não confirma nem nega)", () => {
  it("marca página curta sem marcador como ambígua", () => {
    expect(isAmbiguousPage("<html>erro</html>")).toBe(true);
  });

  it("página grande não é ambígua", () => {
    const big = "<html><title>Lei 13.105/2015</title>" + "x".repeat(6000) + "</html>";
    expect(isAmbiguousPage(big)).toBe(false);
  });
});

describe("LexML — conversão de chave canônica para URN", () => {
  it("converte lei federal com ano", () => {
    expect(canonicalToUrn("br:federal:lei:13105/2015!art489")).toBe(
      "urn:lex:br:federal:lei:2015;13105"
    );
  });

  it("converte lei sem ano", () => {
    expect(canonicalToUrn("br:federal:lei:8078")).toBe("urn:lex:br:federal:lei:8078");
  });

  it("converte constituição federal (com sufixo exigido pelo LexML)", () => {
    expect(canonicalToUrn("br:federal:cf:1988!art5")).toBe(
      "urn:lex:br:federal:constituicao:1988;1988"
    );
  });

  it("converte decreto", () => {
    expect(canonicalToUrn("br:federal:decreto:9999/2020")).toBe(
      "urn:lex:br:federal:decreto:2020;9999"
    );
  });

  it("ignora o sufixo de artigo na URN base", () => {
    const comArtigo = canonicalToUrn("br:federal:lei:10406/2002!art186");
    const semArtigo = canonicalToUrn("br:federal:lei:10406/2002");
    expect(comArtigo).toBe(semArtigo);
  });

  it("retorna null para chave não-legislativa", () => {
    expect(canonicalToUrn("stj:resp:1234567")).toBeNull();
    expect(canonicalToUrn("cnj:00008323520184013202")).toBeNull();
  });

  it("retorna null para tipo desconhecido", () => {
    expect(canonicalToUrn("br:federal:portaria:123")).toBeNull();
  });
});
