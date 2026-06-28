import { describe, it, expect } from "vitest";
import { isSumulaKey } from "../src/lib/sumula-source";

describe("Súmula — reconhecimento de chave canônica", () => {
  it("reconhece súmula STJ", () => {
    expect(isSumulaKey("stj:sumula:7")).toBe(true);
  });

  it("reconhece súmula vinculante STF", () => {
    expect(isSumulaKey("stf:sumula_vinculante:10")).toBe(true);
  });

  it("reconhece súmula STF não-vinculante", () => {
    expect(isSumulaKey("stf:sumula:282")).toBe(true);
  });

  it("rejeita chaves de outros tipos", () => {
    expect(isSumulaKey("cnj:00008323520184013202")).toBe(false);
    expect(isSumulaKey("br:federal:lei:13105/2015")).toBe(false);
    expect(isSumulaKey("stj:resp:1234567")).toBe(false);
    expect(isSumulaKey("stj:tema:1001")).toBe(false);
  });

  it("rejeita formato malformado", () => {
    expect(isSumulaKey("stj:sumula:")).toBe(false);
    expect(isSumulaKey("sumula:7")).toBe(false);
    expect(isSumulaKey("tjsp:sumula:5")).toBe(false);
  });
});
