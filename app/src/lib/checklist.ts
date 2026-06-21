export interface ChecklistItem {
  eixo: "legislacao" | "confidencialidade" | "etica" | "comunicacao";
  pergunta: string;
  automatico: boolean;
}

const CHECKLIST_COMPLETO: ChecklistItem[] = [
  {
    eixo: "legislacao",
    pergunta: "As citações foram conferidas em fonte oficial?",
    automatico: true,
  },
  {
    eixo: "confidencialidade",
    pergunta: "O conteúdo com PII foi mascarado antes do envio ao modelo?",
    automatico: true,
  },
  {
    eixo: "confidencialidade",
    pergunta: "O modelo utilizado é aprovado e não retém/treina com os dados?",
    automatico: false,
  },
  {
    eixo: "confidencialidade",
    pergunta: "O sigilo profissional foi preservado?",
    automatico: false,
  },
  {
    eixo: "etica",
    pergunta: "Houve revisão humana do conteúdo gerado?",
    automatico: false,
  },
  {
    eixo: "etica",
    pergunta: "O advogado responsável assume a autoria e responsabilidade pela peça?",
    automatico: false,
  },
  {
    eixo: "comunicacao",
    pergunta: "O cliente precisa ser informado sobre o uso de IA neste caso?",
    automatico: false,
  },
];

const CHECKLIST_REDUZIDO: ChecklistItem[] = [
  {
    eixo: "confidencialidade",
    pergunta: "O conteúdo com PII foi mascarado antes do envio ao modelo?",
    automatico: true,
  },
  {
    eixo: "etica",
    pergunta: "Houve revisão humana do conteúdo gerado?",
    automatico: false,
  },
];

export function getChecklistItems(
  tier: "vedado" | "alto" | "moderado" | "residual"
): ChecklistItem[] {
  switch (tier) {
    case "vedado":
      return [];
    case "alto":
      return CHECKLIST_COMPLETO;
    case "moderado":
      return CHECKLIST_REDUZIDO;
    case "residual":
      return [];
  }
}
