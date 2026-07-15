import { describe, it, expect, vi, afterEach } from "vitest";
import { maskPiiWithNer, type NerDetectFn } from "../src/lib/pii-ner";

// ============================================================
// Composição regex + NER — detector injetado, sem tocar na API.
// ============================================================

const TEXT =
  "O cliente João da Silva Pereira, CPF 111.444.777-35, residente na Rua das Flores, 123, " +
  "Curitiba, ajuizou ação contra a ré.";

const detectorReturning = (entities: { text: string; type: "NOME" | "ENDERECO" }[]): NerDetectFn =>
  async () => ({ entities, available: true });

const detectorUnavailable: NerDetectFn = async () => ({ entities: [], available: false });

describe("maskPiiWithNer — composição regex + NER", () => {
  it("mascara nomes e endereços além dos padrões estruturados", async () => {
    const result = await maskPiiWithNer(
      TEXT,
      detectorReturning([
        { text: "João da Silva Pereira", type: "NOME" },
        { text: "Rua das Flores, 123, Curitiba", type: "ENDERECO" },
      ])
    );

    expect(result.ner_applied).toBe(true);
    expect(result.masked).toContain("[NOME_1]");
    expect(result.masked).toContain("[ENDERECO_1]");
    expect(result.masked).toContain("[CPF_1]"); // regex continua funcionando
    expect(result.masked).not.toContain("João da Silva Pereira");
    expect(result.masked).not.toContain("Rua das Flores");
    // tokenMap permite reidentificação autorizada
    expect(result.tokenMap["[NOME_1]"]).toBe("João da Silva Pereira");
  });

  it("NER indisponível → só regex, sem bloquear (fail-open para o fluxo, fail-closed para afirmação)", async () => {
    const result = await maskPiiWithNer(TEXT, detectorUnavailable);
    expect(result.ner_applied).toBe(false);
    expect(result.masked).toContain("[CPF_1]");
    expect(result.masked).toContain("João da Silva Pereira"); // regex não cobre nomes
  });

  it("entidade maior tem precedência sobre a menor contida nela", async () => {
    const result = await maskPiiWithNer(
      "Compareceu João da Silva Pereira. João assinou o termo.",
      detectorReturning([
        { text: "João", type: "NOME" },
        { text: "João da Silva Pereira", type: "NOME" },
      ])
    );
    // O nome completo vira NOME_1; o "João" solto vira NOME_2 — nada quebrado no meio.
    expect(result.masked).toContain("[NOME_1]");
    expect(result.masked).not.toContain("Silva Pereira");
    expect(result.tokenMap["[NOME_1]"]).toBe("João da Silva Pereira");
  });

  it("mascara TODAS as ocorrências da mesma entidade", async () => {
    const result = await maskPiiWithNer(
      "Maria Souza requereu. Deferido o pedido de Maria Souza.",
      detectorReturning([{ text: "Maria Souza", type: "NOME" }])
    );
    expect(result.masked).not.toContain("Maria Souza");
    expect((result.masked.match(/\[NOME_1\]/g) ?? []).length).toBe(2);
  });
});

// ============================================================
// nerDetect — fail-closed contra a API real (mockada) e guarda anti-invenção.
// ============================================================

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  class FakeAnthropic {
    messages = { create };
  }
  return { default: FakeAnthropic, __create: create };
});

describe("nerDetect — fail-closed e anti-invenção", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function loadNerWithApiMock(behavior: (create: ReturnType<typeof vi.fn>) => void) {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-teste");
    const sdk = (await import("@anthropic-ai/sdk")) as unknown as { __create: ReturnType<typeof vi.fn> };
    behavior(sdk.__create);
    const { nerDetect } = await import("../src/lib/pii-ner");
    return nerDetect;
  }

  it("erro de API (sem créditos/rede) → lista vazia + available:false, nunca lança", async () => {
    const ner = await loadNerWithApiMock((create) =>
      create.mockRejectedValue(new Error("credit balance too low"))
    );
    const result = await ner("O cliente João da Silva compareceu.");
    expect(result).toEqual({ entities: [], available: false });
  });

  it("entidade que NÃO está no texto é descartada (modelo não pode inventar PII)", async () => {
    const ner = await loadNerWithApiMock((create) =>
      create.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              entities: [
                { text: "João da Silva", type: "NOME" },
                { text: "Carlos Inventado", type: "NOME" },
              ],
            }),
          },
        ],
      })
    );
    const result = await ner("O cliente João da Silva compareceu.");
    expect(result.available).toBe(true);
    expect(result.entities).toEqual([{ text: "João da Silva", type: "NOME" }]);
  });

  it("resposta fora do schema → available:false", async () => {
    const ner = await loadNerWithApiMock((create) =>
      create.mockResolvedValue({
        content: [{ type: "text", text: '{"entities":[{"text":"x","type":"CPF"}]}' }],
      })
    );
    const result = await ner("qualquer texto");
    expect(result).toEqual({ entities: [], available: false });
  });
});
