import { describe, it, expect } from "vitest";
import { classifyRisk, type RiskSignals, type DecisionRule } from "../src/lib/risk-engine";
import { getChecklistItems } from "../src/lib/checklist";

const DECISION_TABLE: DecisionRule[] = [
  {
    when: { data_sensitivity: ["segredo_justica"], provider_posture: "nao_aprovado" },
    tier: "vedado",
    decision: "block",
    reason: "segredo de justiça em modelo não aprovado",
  },
  {
    when: { client_constraints: ["proibe_ia"] },
    tier: "vedado",
    decision: "block",
    reason: "cláusula contratual do cliente",
  },
  {
    when: { legal_effect: true, task_type: ["peca", "contrato", "parecer"] },
    tier: "alto",
    decision: "require_approval",
    controls: ["mascarar_pii", "validar_citacoes", "checklist_completo", "supervisao_socio"],
  },
  {
    when: { data_sensitivity: ["pii", "sensivel_lgpd"] },
    tier: "moderado",
    decision: "allow_with_masking",
    controls: ["mascarar_pii", "checklist_reduzido"],
  },
  {
    when: {},
    tier: "residual",
    decision: "allow",
    controls: ["registrar"],
  },
];

const baseSignals: RiskSignals = {
  task_type: "pesquisa",
  data_sensitivity: [],
  legal_effect: false,
  autonomy: "com_revisao",
  provider_posture: "aprovado",
  client_constraints: [],
  injection_flags: [],
};

describe("Motor de classificação de risco", () => {
  it("classifica pesquisa genérica como residual/allow", () => {
    const result = classifyRisk(baseSignals, DECISION_TABLE);
    expect(result.tier).toBe("residual");
    expect(result.decision).toBe("allow");
  });

  it("bloqueia segredo de justiça em modelo não aprovado (vedado)", () => {
    const signals: RiskSignals = {
      ...baseSignals,
      data_sensitivity: ["segredo_justica"],
      provider_posture: "nao_aprovado",
    };
    const result = classifyRisk(signals, DECISION_TABLE);
    expect(result.tier).toBe("vedado");
    expect(result.decision).toBe("block");
  });

  it("bloqueia quando cliente proíbe IA (vedado)", () => {
    const signals: RiskSignals = {
      ...baseSignals,
      client_constraints: ["proibe_ia"],
    };
    const result = classifyRisk(signals, DECISION_TABLE);
    expect(result.tier).toBe("vedado");
    expect(result.decision).toBe("block");
  });

  it("exige aprovação para peça com efeito jurídico (alto)", () => {
    const signals: RiskSignals = {
      ...baseSignals,
      task_type: "peca",
      legal_effect: true,
    };
    const result = classifyRisk(signals, DECISION_TABLE);
    expect(result.tier).toBe("alto");
    expect(result.decision).toBe("require_approval");
    expect(result.controls).toContain("checklist_completo");
    expect(result.controls).toContain("supervisao_socio");
  });

  it("permite com mascaramento quando há PII (moderado)", () => {
    const signals: RiskSignals = {
      ...baseSignals,
      data_sensitivity: ["pii"],
    };
    const result = classifyRisk(signals, DECISION_TABLE);
    expect(result.tier).toBe("moderado");
    expect(result.decision).toBe("allow_with_masking");
  });

  it("incerteza eleva o risco — tabela vazia resulta em alto", () => {
    const result = classifyRisk(baseSignals, []);
    expect(result.tier).toBe("alto");
    expect(result.decision).toBe("require_approval");
  });

  it("a regra mais restritiva vence (block prevalece)", () => {
    const signals: RiskSignals = {
      ...baseSignals,
      data_sensitivity: ["segredo_justica"],
      provider_posture: "nao_aprovado",
      legal_effect: true,
      task_type: "peca",
    };
    const result = classifyRisk(signals, DECISION_TABLE);
    expect(result.decision).toBe("block");
  });
});

describe("Checklist ético — OAB 001/2024", () => {
  it("alto risco retorna checklist completo (4 eixos)", () => {
    const items = getChecklistItems("alto");
    expect(items.length).toBe(7);
    const eixos = new Set(items.map((i) => i.eixo));
    expect(eixos).toContain("legislacao");
    expect(eixos).toContain("confidencialidade");
    expect(eixos).toContain("etica");
    expect(eixos).toContain("comunicacao");
  });

  it("moderado retorna checklist reduzido", () => {
    const items = getChecklistItems("moderado");
    expect(items.length).toBe(2);
  });

  it("residual não retorna checklist (zero atrito)", () => {
    const items = getChecklistItems("residual");
    expect(items).toHaveLength(0);
  });

  it("vedado não retorna checklist (bloqueio direto)", () => {
    const items = getChecklistItems("vedado");
    expect(items).toHaveLength(0);
  });
});
