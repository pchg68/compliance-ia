import { describe, it, expect, vi, afterEach } from "vitest";
import { validateCitation, type SourceLookupFn } from "../src/lib/citation-validator";
import type { ExtractedCitation } from "../src/lib/citation-extractor";
import type { SemanticJudgeFn } from "../src/lib/semantic-judge";

// ============================================================
// Integração do eixo 2 (conteúdo) no validador — juiz injetado,
// sem tocar na API da Anthropic.
// ============================================================

const FULL_TEXT =
  "Como se sabe, a pretensão de simples reexame de prova não enseja recurso especial, " +
  "conforme consolidado na Súmula 7 do STJ, aplicável ao caso concreto em todos os seus termos.";

const CITATION: ExtractedCitation = {
  raw_text: "Súmula 7 do STJ",
  cite_type: "sumula",
  canonical_key: "stj:sumula:7",
  start: FULL_TEXT.indexOf("Súmula 7 do STJ"),
  end: FULL_TEXT.indexOf("Súmula 7 do STJ") + "Súmula 7 do STJ".length,
};

const FOUND: SourceLookupFn = async () => ({
  found: true,
  source: "Sumula",
  source_ref: "https://www.stj.jus.br/docs_internet/SumulasSTJ.pdf",
  content: "A pretensão de simples reexame de prova não enseja recurso especial.",
  revoked: false,
});

const judgeReturning = (verdict: "consistente" | "divergente" | "insuficiente"): SemanticJudgeFn =>
  async () => ({ verdict, justificativa: "teste" });

describe("citation-validator — eixo de conteúdo (juiz semântico)", () => {
  it("juiz 'consistente' → confirmada com confiança elevada", async () => {
    const result = await validateCitation(CITATION, FOUND, {
      judge: judgeReturning("consistente"),
      fullText: FULL_TEXT,
    });
    expect(result.status).toBe("confirmada");
    expect(result.confidence).toBe(0.98);
  });

  it("juiz 'divergente' → status divergente (número certo, tese errada)", async () => {
    const result = await validateCitation(CITATION, FOUND, {
      judge: judgeReturning("divergente"),
      fullText: FULL_TEXT,
    });
    expect(result.status).toBe("divergente");
    expect(result.evidence_excerpt).toContain("reexame de prova");
  });

  it("juiz 'insuficiente' → mantém confirmada por existência (não rebaixa por inferência)", async () => {
    const result = await validateCitation(CITATION, FOUND, {
      judge: judgeReturning("insuficiente"),
      fullText: FULL_TEXT,
    });
    expect(result.status).toBe("confirmada");
    expect(result.confidence).toBe(0.95);
  });

  it("sem juiz → comportamento anterior intacto (confirmada por existência)", async () => {
    const result = await validateCitation(CITATION, FOUND, {});
    expect(result.status).toBe("confirmada");
    expect(result.confidence).toBe(0.95);
  });

  it("citação sem tese alegada ao redor (contexto ≈ só a referência) → juiz não é chamado", async () => {
    const judge = vi.fn(judgeReturning("divergente"));
    const bare = "Súmula 7 do STJ";
    const citation: ExtractedCitation = { ...CITATION, start: 0, end: bare.length };
    const result = await validateCitation(citation, FOUND, {
      judge,
      fullText: bare,
    });
    expect(judge).not.toHaveBeenCalled();
    expect(result.status).toBe("confirmada");
  });

  it("juiz não roda para citação não localizada (eixo 1 decide antes)", async () => {
    const judge = vi.fn(judgeReturning("consistente"));
    const notFound: SourceLookupFn = async () => ({
      found: false,
      source: "Sumula",
      source_ref: null,
      content: null,
      revoked: false,
    });
    const result = await validateCitation(CITATION, notFound, {
      judge,
      fullText: FULL_TEXT,
    });
    expect(judge).not.toHaveBeenCalled();
    expect(result.status).toBe("nao_localizada");
  });
});

// ============================================================
// Wrapper judgeCitation — fail-closed contra a API real (mockada).
// ============================================================

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  class FakeAnthropic {
    messages = { create };
  }
  return { default: FakeAnthropic, __create: create };
});

describe("semantic-judge — fail-closed", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function loadJudgeWithApiMock(behavior: (create: ReturnType<typeof vi.fn>) => void) {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-teste");
    const sdk = (await import("@anthropic-ai/sdk")) as unknown as { __create: ReturnType<typeof vi.fn> };
    behavior(sdk.__create);
    const { judgeCitation } = await import("../src/lib/semantic-judge");
    return judgeCitation;
  }

  const INPUT = {
    citation: "Súmula 7 do STJ",
    claimContext: "…a pretensão de simples reexame de prova não enseja recurso especial…",
    officialText: "A pretensão de simples reexame de prova não enseja recurso especial.",
  };

  it("erro de API (sem créditos/rede) → insuficiente, nunca lança", async () => {
    const judge = await loadJudgeWithApiMock((create) =>
      create.mockRejectedValue(new Error("credit balance too low"))
    );
    const verdict = await judge(INPUT);
    expect(verdict.verdict).toBe("insuficiente");
  });

  it("resposta fora do schema fechado → insuficiente", async () => {
    const judge = await loadJudgeWithApiMock((create) =>
      create.mockResolvedValue({
        content: [{ type: "text", text: '{"verdict":"talvez","justificativa":"x"}' }],
      })
    );
    const verdict = await judge(INPUT);
    expect(verdict.verdict).toBe("insuficiente");
  });

  it("resposta válida do modelo → veredito propagado", async () => {
    const judge = await loadJudgeWithApiMock((create) =>
      create.mockResolvedValue({
        content: [
          { type: "text", text: '{"verdict":"divergente","justificativa":"tese contrária"}' },
        ],
      })
    );
    const verdict = await judge(INPUT);
    expect(verdict.verdict).toBe("divergente");
    expect(verdict.justificativa).toBe("tese contrária");
  });
});
