/**
 * Juiz semântico do validador de citações — eixo 2 (conteúdo).
 *
 * Compara a tese ALEGADA no documento com o texto OFICIAL recuperado da fonte
 * e responde em esquema fechado: consistente | divergente | insuficiente.
 *
 * Invariante 3 (desenho-tecnico-validador-de-citacoes.md, seção 5):
 *  - O juiz recebe SÓ o texto oficial recuperado — nunca "completa" ou
 *    "corrige" uma citação com conhecimento próprio do modelo.
 *  - Qualquer falha (sem chave, sem créditos, rede, resposta fora do schema)
 *    vira `insuficiente` — fail-closed: nunca afirma nem nega por inferência.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";

export interface JudgeInput {
  /** A citação como apareceu no documento (ex.: "Súmula 7 do STJ"). */
  citation: string;
  /** Trecho do documento ao redor da citação — a tese alegada. */
  claimContext: string;
  /** Texto oficial recuperado da fonte (ementa, enunciado, metadados). */
  officialText: string;
}

export interface JudgeVerdict {
  verdict: "consistente" | "divergente" | "insuficiente";
  justificativa: string;
}

/** Assinatura injetável — os testes usam um juiz falso sem tocar na API. */
export type SemanticJudgeFn = (input: JudgeInput) => Promise<JudgeVerdict>;

const verdictSchema = z.object({
  verdict: z.enum(["consistente", "divergente", "insuficiente"]),
  justificativa: z.string(),
});

// Schema JSON fechado enviado à API (structured outputs) — o modelo não
// consegue responder fora deste formato.
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["consistente", "divergente", "insuficiente"],
      description:
        "consistente: a tese alegada é compatível com o texto oficial; " +
        "divergente: a tese alegada CONTRADIZ o texto oficial; " +
        "insuficiente: o texto oficial não permite confirmar nem negar a tese.",
    },
    justificativa: {
      type: "string",
      description: "Uma frase objetiva citando o trecho oficial que sustenta o veredito.",
    },
  },
  required: ["verdict", "justificativa"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Você é um verificador de citações jurídicas. Sua ÚNICA fonte de verdade é o TEXTO OFICIAL fornecido na mensagem — você está PROIBIDO de usar qualquer conhecimento próprio sobre leis, súmulas ou precedentes.

Tarefa: comparar a TESE ALEGADA no documento com o TEXTO OFICIAL recuperado da fonte.

Regras invioláveis:
1. Se o texto oficial claramente sustenta a tese alegada → "consistente".
2. Se o texto oficial claramente CONTRADIZ a tese alegada (número certo, tese errada) → "divergente".
3. Se o texto oficial for curto, genérico ou não tratar do ponto alegado (ex.: só metadados processuais) → "insuficiente". Na dúvida entre qualquer veredito e "insuficiente", escolha "insuficiente".
4. NUNCA complete, corrija ou reinterprete a citação com conhecimento externo. O que não está no texto oficial não existe para você.`;

/** O juiz só opera com a chave configurada; sem ela, o eixo de conteúdo é pulado. */
export function isJudgeEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const JUDGE_MODEL = () => process.env.CITATION_JUDGE_MODEL ?? "claude-opus-4-8";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const judgeCitation: SemanticJudgeFn = async (input) => {
  try {
    const response = await getClient().messages.create({
      model: JUDGE_MODEL(),
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: {
          type: "json_schema",
          schema: OUTPUT_SCHEMA,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            `CITAÇÃO: ${input.citation}`,
            ``,
            `TESE ALEGADA NO DOCUMENTO (trecho ao redor da citação):`,
            input.claimContext,
            ``,
            `TEXTO OFICIAL RECUPERADO DA FONTE:`,
            input.officialText,
          ].join("\n"),
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { verdict: "insuficiente", justificativa: "Resposta do juiz sem conteúdo textual." };
    }

    const parsed = verdictSchema.safeParse(JSON.parse(textBlock.text));
    if (!parsed.success) {
      return { verdict: "insuficiente", justificativa: "Resposta do juiz fora do esquema fechado." };
    }
    return parsed.data;
  } catch {
    // Fail-closed: sem créditos, sem rede, rate limit, refusal — nada disso
    // pode virar afirmação. O eixo de conteúdo simplesmente não conclui.
    return {
      verdict: "insuficiente",
      justificativa: "Avaliação semântica indisponível (falha na chamada ao modelo).",
    };
  }
};
