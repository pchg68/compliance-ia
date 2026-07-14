import type { DecisionRule } from "./risk-engine";
import { getChecklistItems, type ChecklistItem } from "./checklist";

export interface JurisdictionProfile {
  code: string;
  label: string;
  locale: string;
  risk_levels: { key: string; label: string }[];
  decision_table: DecisionRule[];
  checklist_alto: ChecklistItem[];
  checklist_moderado: ChecklistItem[];
  regulatory_refs: string[];
}

export const JURISDICTION_BR: JurisdictionProfile = {
  code: "BR",
  label: "Brasil (PL 2338 / OAB / ANPD)",
  locale: "pt-BR",
  risk_levels: [
    { key: "vedado", label: "Vedado (risco excessivo)" },
    { key: "alto", label: "Alto" },
    { key: "moderado", label: "Moderado" },
    { key: "residual", label: "Residual (baixo)" },
  ],
  decision_table: [
    {
      when: { data_sensitivity: ["segredo_justica"], provider_posture: "nao_aprovado" },
      tier: "vedado", decision: "block",
      reason: "Segredo de justiça em modelo não aprovado",
    },
    {
      when: { client_constraints: ["proibe_ia"] },
      tier: "vedado", decision: "block",
      reason: "Cláusula contratual do cliente proíbe uso de IA",
    },
    {
      when: { legal_effect: true, task_type: ["peca", "contrato", "parecer"] },
      tier: "alto", decision: "require_approval",
      controls: ["mascarar_pii", "validar_citacoes", "checklist_completo", "supervisao_socio", "registro_aia"],
    },
    {
      when: { data_sensitivity: ["pii", "sensivel_lgpd"] },
      tier: "moderado", decision: "allow_with_masking",
      controls: ["mascarar_pii", "checklist_reduzido"],
    },
    {
      when: {}, tier: "residual", decision: "allow",
      controls: ["registrar"],
    },
  ],
  checklist_alto: [
    { eixo: "legislacao", pergunta: "As citações foram conferidas em fonte oficial?", automatico: true },
    { eixo: "confidencialidade", pergunta: "O conteúdo com PII foi mascarado antes do envio ao modelo?", automatico: true },
    { eixo: "confidencialidade", pergunta: "O modelo utilizado é aprovado e não retém/treina com os dados?", automatico: false },
    { eixo: "confidencialidade", pergunta: "O sigilo profissional foi preservado?", automatico: false },
    { eixo: "etica", pergunta: "Houve revisão humana do conteúdo gerado?", automatico: false },
    { eixo: "etica", pergunta: "O advogado responsável assume a autoria e responsabilidade pela peça?", automatico: false },
    { eixo: "comunicacao", pergunta: "O cliente precisa ser informado sobre o uso de IA neste caso?", automatico: false },
  ],
  checklist_moderado: [
    { eixo: "confidencialidade", pergunta: "O conteúdo com PII foi mascarado antes do envio ao modelo?", automatico: true },
    { eixo: "etica", pergunta: "Houve revisão humana do conteúdo gerado?", automatico: false },
  ],
  regulatory_refs: [
    "Recomendação OAB nº 001/2024",
    "PL 2338/2023 (Marco Legal da IA)",
    "ANPD — Agenda Regulatória 2025–2026",
    "CNJ — Resolução nº 615/2025",
  ],
};

export const JURISDICTION_EU: JurisdictionProfile = {
  code: "EU",
  label: "European Union (AI Act / GDPR)",
  locale: "en",
  risk_levels: [
    { key: "unacceptable", label: "Unacceptable risk" },
    { key: "high", label: "High risk" },
    { key: "limited", label: "Limited risk" },
    { key: "minimal", label: "Minimal risk" },
  ],
  decision_table: [
    {
      when: { data_sensitivity: ["biometric_realtime"], task_type: ["social_scoring"] },
      tier: "vedado", decision: "block",
      reason: "Prohibited AI practice under AI Act Art. 5",
    },
    {
      when: { data_sensitivity: ["special_category_gdpr"], provider_posture: "nao_aprovado" },
      tier: "vedado", decision: "block",
      reason: "Special category data (Art. 9 GDPR) with non-compliant processor",
    },
    {
      when: { legal_effect: true },
      tier: "alto", decision: "require_approval",
      controls: ["mask_pii", "dpia_required", "full_checklist", "human_oversight", "conformity_assessment"],
    },
    {
      when: { data_sensitivity: ["personal_data"] },
      tier: "moderado", decision: "allow_with_masking",
      controls: ["mask_pii", "transparency_notice", "reduced_checklist"],
    },
    {
      when: {}, tier: "residual", decision: "allow",
      controls: ["log_only"],
    },
  ],
  checklist_alto: [
    { eixo: "legislacao", pergunta: "Is the AI system classified under Annex III of the AI Act?", automatico: false },
    { eixo: "legislacao", pergunta: "Has a conformity assessment been conducted (Art. 43 AI Act)?", automatico: false },
    { eixo: "confidencialidade", pergunta: "Has personal data been pseudonymised/anonymised before processing?", automatico: true },
    { eixo: "confidencialidade", pergunta: "Is there a valid legal basis under Art. 6 GDPR?", automatico: false },
    { eixo: "confidencialidade", pergunta: "Has a Data Protection Impact Assessment (DPIA) been completed (Art. 35 GDPR)?", automatico: false },
    { eixo: "etica", pergunta: "Is meaningful human oversight in place (Art. 14 AI Act)?", automatico: false },
    { eixo: "etica", pergunta: "Can the decision be explained to the data subject (Art. 22 GDPR)?", automatico: false },
    { eixo: "comunicacao", pergunta: "Has the individual been informed they are interacting with AI (Art. 52 AI Act)?", automatico: false },
    { eixo: "comunicacao", pergunta: "Is the AI system registered in the EU database (Art. 60 AI Act)?", automatico: false },
  ],
  checklist_moderado: [
    { eixo: "confidencialidade", pergunta: "Has personal data been masked before sending to the AI model?", automatico: true },
    { eixo: "comunicacao", pergunta: "Has the individual been informed they are interacting with AI?", automatico: false },
  ],
  regulatory_refs: [
    "EU AI Act (Regulation 2024/1689)",
    "GDPR (Regulation 2016/679)",
    "EU Charter of Fundamental Rights",
  ],
};

const JURISDICTIONS: Record<string, JurisdictionProfile> = {
  BR: JURISDICTION_BR,
  EU: JURISDICTION_EU,
};

export function getJurisdiction(code: string): JurisdictionProfile {
  const profile = JURISDICTIONS[code.toUpperCase()];
  if (!profile) {
    throw new Error(`Jurisdição não suportada: ${code}. Disponíveis: ${Object.keys(JURISDICTIONS).join(", ")}`);
  }
  return profile;
}

export function listJurisdictions(): { code: string; label: string }[] {
  return Object.values(JURISDICTIONS).map((j) => ({ code: j.code, label: j.label }));
}

/**
 * Checklist ético do tier segundo a jurisdição ativa da política.
 * Sem jurisdição conhecida, cai no checklist BR fixo (default conservador).
 */
export function getChecklistForTier(
  jurisdictionCode: string | undefined,
  tier: "vedado" | "alto" | "moderado" | "residual"
): ChecklistItem[] {
  if (!jurisdictionCode) {
    // import tardio evitaria ciclo, mas checklist.ts não importa este módulo — seguro.
    return getChecklistItems(tier);
  }
  const profile = getJurisdiction(jurisdictionCode);
  switch (tier) {
    case "alto":
      return profile.checklist_alto;
    case "moderado":
      return profile.checklist_moderado;
    default:
      return [];
  }
}
