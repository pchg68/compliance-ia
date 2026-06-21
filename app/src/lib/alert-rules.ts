import type { RiskSignals } from "./risk-engine";

export interface AlertDef {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  title: string;
  description: string;
}

export function evaluateAlerts(
  signals: RiskSignals,
  decision: string,
  piiMatchCount: number
): AlertDef[] {
  const alerts: AlertDef[] = [];

  if (decision === "block") {
    alerts.push({
      severity: "critical",
      category: "bloqueio",
      title: "Interação bloqueada pelo motor de risco",
      description: `Decisão de bloqueio aplicada. Sinais: ${JSON.stringify(signals)}`,
    });
  }

  if (signals.data_sensitivity.includes("segredo_justica")) {
    alerts.push({
      severity: "critical",
      category: "sigilo",
      title: "Dado sob segredo de justiça detectado",
      description: "Conteúdo classificado como segredo de justiça foi submetido a modelo de IA.",
    });
  }

  if (signals.provider_posture === "nao_aprovado") {
    alerts.push({
      severity: "high",
      category: "provedor",
      title: "Modelo de IA não aprovado utilizado",
      description: "Interação com provedor/modelo que não consta na lista de aprovados.",
    });
  }

  if (signals.autonomy === "sem_revisao" && signals.legal_effect) {
    alerts.push({
      severity: "high",
      category: "supervisao",
      title: "Saída com efeito jurídico sem revisão humana",
      description: "Conteúdo com efeito jurídico foi gerado sem supervisão humana configurada.",
    });
  }

  if (signals.injection_flags.length > 0) {
    alerts.push({
      severity: "high",
      category: "seguranca",
      title: "Prompt injection detectado",
      description: `Flags de injeção: ${signals.injection_flags.join(", ")}`,
    });
  }

  if (piiMatchCount > 10) {
    alerts.push({
      severity: "medium",
      category: "pii",
      title: "Volume alto de PII detectado",
      description: `${piiMatchCount} ocorrências de PII encontradas em uma única interação.`,
    });
  }

  if (signals.client_constraints.includes("proibe_ia")) {
    alerts.push({
      severity: "critical",
      category: "contratual",
      title: "Uso de IA proibido por cláusula contratual do cliente",
      description: "O cliente possui restrição contratual ao uso de IA.",
    });
  }

  return alerts;
}
