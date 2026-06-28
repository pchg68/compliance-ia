import { describe, it, expect } from "vitest";
import { canonicalToUrn } from "../src/lib/lexml-client";

describe("LexML — conversão de chave canônica para URN", () => {
  it("converte lei federal com ano", () => {
    expect(canonicalToUrn("br:federal:lei:13105/2015!art489")).toBe(
      "urn:lex:br:federal:lei:2015;13105"
    );
  });

  it("converte lei sem ano", () => {
    expect(canonicalToUrn("br:federal:lei:8078")).toBe("urn:lex:br:federal:lei:8078");
  });

  it("converte constituição federal", () => {
    expect(canonicalToUrn("br:federal:cf:1988!art5")).toBe(
      "urn:lex:br:federal:constituicao:1988"
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
