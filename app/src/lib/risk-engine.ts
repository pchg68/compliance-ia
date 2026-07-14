export interface RiskSignals {
  task_type: string;
  data_sensitivity: string[];
  legal_effect: boolean;
  autonomy: "com_revisao" | "sem_revisao";
  provider_posture: "aprovado" | "nao_aprovado";
  client_constraints: string[];
  injection_flags: string[];
}

export interface DecisionRule {
  when: Record<string, unknown>;
  tier: "vedado" | "alto" | "moderado" | "residual";
  decision: "block" | "require_approval" | "allow_with_masking" | "allow";
  reason?: string;
  controls?: string[];
}

export interface RiskResult {
  tier: "vedado" | "alto" | "moderado" | "residual";
  decision: "block" | "require_approval" | "allow_with_masking" | "allow";
  matched_rule: string | null;
  controls: string[];
  computed_by: "deterministico";
}

export type RiskClass = "excessivo" | "alto" | "moderado" | "baixo";

/**
 * Mapeia o tier do motor (taxonomia PL 2338: vedado/alto/moderado/residual) para a
 * classe gravada em ai_interaction.risk_class e usada pelo dashboard
 * (excessivo/alto/moderado/baixo). Mapeamento total — sem default que rebaixe risco.
 */
export function tierToRiskClass(tier: RiskResult["tier"]): RiskClass {
  switch (tier) {
    case "vedado":
      return "excessivo";
    case "alto":
      return "alto";
    case "moderado":
      return "moderado";
    case "residual":
      return "baixo";
  }
}

function matchesCondition(
  signals: RiskSignals,
  when: Record<string, unknown>
): boolean {
  for (const [key, expected] of Object.entries(when)) {
    const actual = signals[key as keyof RiskSignals];

    if (Array.isArray(expected)) {
      if (Array.isArray(actual)) {
        if (!expected.some((v) => actual.includes(v))) return false;
      } else {
        if (!expected.includes(actual)) return false;
      }
    } else if (typeof expected === "boolean") {
      if (actual !== expected) return false;
    } else if (typeof expected === "string") {
      if (Array.isArray(actual)) {
        if (!actual.includes(expected)) return false;
      } else {
        if (actual !== expected) return false;
      }
    }
  }
  return true;
}

export function classifyRisk(
  signals: RiskSignals,
  decisionTable: DecisionRule[]
): RiskResult {
  for (let i = 0; i < decisionTable.length; i++) {
    const rule = decisionTable[i];
    if (Object.keys(rule.when).length === 0 || matchesCondition(signals, rule.when)) {
      return {
        tier: rule.tier,
        decision: rule.decision,
        matched_rule: `rule_${i}`,
        controls: rule.controls ?? ["registrar"],
        computed_by: "deterministico",
      };
    }
  }

  // Regra de ouro: incerteza eleva o risco
  return {
    tier: "alto",
    decision: "require_approval",
    matched_rule: null,
    controls: ["mascarar_pii", "checklist_completo", "supervisao_socio"],
    computed_by: "deterministico",
  };
}
