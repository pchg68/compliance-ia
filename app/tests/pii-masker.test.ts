import { describe, it, expect } from "vitest";
import { maskPii, unmaskPii } from "../src/lib/pii-masker";

describe("Mascaramento de PII — regex estruturado", () => {
  it("mascara CPF válido com pontuação", () => {
    const result = maskPii("O CPF do cliente é 529.982.247-25.");
    expect(result.masked).toContain("[CPF_1]");
    expect(result.masked).not.toContain("529.982.247-25");
    expect(result.tokenMap["[CPF_1]"]).toBe("529.982.247-25");
    expect(result.techniques["[CPF_1]"]).toBe("pseudonimizacao");
  });

  it("mascara CPF válido sem pontuação", () => {
    const result = maskPii("CPF: 52998224725");
    expect(result.masked).toContain("[CPF_1]");
  });

  it("rejeita CPF com dígito verificador inválido", () => {
    const result = maskPii("CPF: 111.111.111-11");
    expect(result.matches.filter((m) => m.type === "CPF")).toHaveLength(0);
  });

  it("mascara CNPJ válido", () => {
    const result = maskPii("CNPJ: 11.222.333/0001-81");
    expect(result.masked).toContain("[CNPJ_1]");
    expect(result.tokenMap["[CNPJ_1]"]).toBe("11.222.333/0001-81");
  });

  it("mascara email", () => {
    const result = maskPii("Contato: joao@escritorio.com.br");
    expect(result.masked).toContain("[EMAIL_1]");
    expect(result.masked).not.toContain("joao@escritorio.com.br");
  });

  it("mascara telefone brasileiro", () => {
    const result = maskPii("Ligar para (41) 99876-5432");
    expect(result.masked).toContain("[TELEFONE_1]");
  });

  it("mascara número de processo CNJ", () => {
    const result = maskPii("Autos nº 0001234-56.2026.8.16.0001");
    expect(result.masked).toContain("[PROCESSO_CNJ_1]");
  });

  it("mascara número OAB", () => {
    const result = maskPii("Advogado: OAB/PR 12345");
    expect(result.masked).toContain("[OAB_1]");
  });

  it("mascara CEP", () => {
    const result = maskPii("Endereço com CEP 80060-150");
    expect(result.masked).toContain("[CEP_1]");
  });

  it("mascara múltiplos tipos no mesmo texto", () => {
    const text =
      "Cliente João, CPF 529.982.247-25, email joao@test.com, processo 0001234-56.2026.8.16.0001";
    const result = maskPii(text);
    expect(result.matches.length).toBeGreaterThanOrEqual(3);
    expect(result.masked).not.toContain("529.982.247-25");
    expect(result.masked).not.toContain("joao@test.com");
    expect(result.masked).not.toContain("0001234-56.2026.8.16.0001");
  });

  it("de-tokeniza corretamente (unmask)", () => {
    const original = "CPF do cliente: 529.982.247-25, email: joao@test.com";
    const result = maskPii(original);
    const restored = unmaskPii(result.masked, result.tokenMap);
    expect(restored).toBe(original);
  });

  it("texto sem PII retorna inalterado", () => {
    const text = "Este é um texto genérico sem dados pessoais.";
    const result = maskPii(text);
    expect(result.masked).toBe(text);
    expect(result.matches).toHaveLength(0);
  });

  it("registra técnica como pseudonimização para cada match", () => {
    const result = maskPii("CPF 529.982.247-25 e email teste@x.com");
    for (const technique of Object.values(result.techniques)) {
      expect(technique).toBe("pseudonimizacao");
    }
  });
});
