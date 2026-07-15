/**
 * NER de PII em texto livre — Fase 2 do mascaramento (desenho técnico do
 * gateway, seção "Entidades livres"): nomes próprios e endereços que o
 * regex estruturado (CPF/CNPJ/email/...) não captura.
 *
 * Mesmo padrão fail-closed do juiz semântico:
 *  - Schema JSON fechado (structured outputs) — o modelo só devolve entidades.
 *  - Só aceita entidades LITERALMENTE presentes no texto (guarda contra invenção).
 *  - Qualquer falha (sem chave, sem créditos, rede, refusal, schema inválido)
 *    → lista vazia + `available: false`; o mascaramento regex continua valendo
 *    e o fluxo NUNCA é bloqueado pela indisponibilidade do NER.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { maskPii, type MaskResult, type PiiMatch } from "./pii-masker";

export interface NerEntity {
  text: string;
  type: "NOME" | "ENDERECO";
}

export interface NerResult {
  entities: NerEntity[];
  /** false quando o NER não pôde rodar (sem chave/créditos/erro) — não é "sem PII". */
  available: boolean;
}

/** Assinatura injetável — os testes usam um detector falso sem tocar na API. */
export type NerDetectFn = (text: string) => Promise<NerResult>;

const nerSchema = z.object({
  entities: z.array(
    z.object({
      text: z.string(),
      type: z.enum(["NOME", "ENDERECO"]),
    })
  ),
});

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "O trecho EXATO como aparece no texto — cópia literal, sem normalizar.",
          },
          type: { type: "string", enum: ["NOME", "ENDERECO"] },
        },
        required: ["text", "type"],
        additionalProperties: false,
      },
    },
  },
  required: ["entities"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Você é um detector de dados pessoais em texto jurídico brasileiro (LGPD).

Tarefa: listar APENAS nomes de pessoas físicas (NOME) e endereços físicos (ENDERECO) que aparecem LITERALMENTE no texto fornecido.

Regras invioláveis:
1. Copie cada entidade EXATAMENTE como está no texto — mesma grafia, mesmos acentos, sem completar nem corrigir.
2. NOME: apenas pessoas físicas (partes, clientes, testemunhas, advogados). NÃO inclua: nomes de tribunais, órgãos, empresas citadas como instituição, ministros/juízes em citações de jurisprudência (ex.: "Rel. Min. Fulano" faz parte da referência, não é PII do caso).
3. ENDERECO: logradouro/número/bairro/cidade de pessoa física. NÃO inclua endereços institucionais públicos (fórum, tribunal).
4. Placeholders já mascarados (ex.: [CPF_1], [EMAIL_1]) não são entidades.
5. Se não houver nenhuma entidade, devolva a lista vazia. NUNCA invente.`;

export function isNerEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const NER_MODEL = () => process.env.PII_NER_MODEL ?? "claude-opus-4-8";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export const nerDetect: NerDetectFn = async (text) => {
  try {
    const response = await getClient().messages.create({
      model: NER_MODEL(),
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      messages: [{ role: "user", content: text }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { entities: [], available: false };
    }

    const parsed = nerSchema.safeParse(JSON.parse(textBlock.text));
    if (!parsed.success) {
      return { entities: [], available: false };
    }

    // Guarda anti-invenção: só entidades literalmente presentes no texto.
    const entities = parsed.data.entities.filter((e) => e.text.length >= 3 && text.includes(e.text));
    return { entities, available: true };
  } catch {
    return { entities: [], available: false };
  }
};

export interface FullMaskResult extends MaskResult {
  /** false quando o NER não rodou — o mascaramento cobriu só padrões estruturados. */
  ner_applied: boolean;
}

/**
 * Mascaramento completo: regex estruturado primeiro (determinístico), depois
 * NER sobre o texto já mascarado. `detect` é injetável para testes.
 */
export async function maskPiiWithNer(
  text: string,
  detect: NerDetectFn = nerDetect
): Promise<FullMaskResult> {
  const regexResult = maskPii(text);

  if (!isNerEnabled() && detect === nerDetect) {
    return { ...regexResult, ner_applied: false };
  }

  const ner = await detect(regexResult.masked);
  if (!ner.available) {
    return { ...regexResult, ner_applied: false };
  }

  let masked = regexResult.masked;
  const tokenMap = { ...regexResult.tokenMap };
  const techniques = { ...regexResult.techniques };
  const matches: PiiMatch[] = [...regexResult.matches];
  const counters: Record<string, number> = {};

  // Entidades maiores primeiro — evita que "João" quebre "João da Silva".
  const unique = [...new Map(ner.entities.map((e) => [e.text, e])).values()].sort(
    (a, b) => b.text.length - a.text.length
  );

  for (const entity of unique) {
    if (!masked.includes(entity.text)) continue; // já coberto por entidade maior
    counters[entity.type] = (counters[entity.type] ?? 0) + 1;
    const placeholder = `[${entity.type}_${counters[entity.type]}]`;
    const firstIdx = masked.indexOf(entity.text);

    masked = masked.split(entity.text).join(placeholder);
    tokenMap[placeholder] = entity.text;
    techniques[placeholder] = "pseudonimizacao";
    matches.push({
      type: entity.type,
      original: entity.text,
      placeholder,
      start: firstIdx,
      end: firstIdx + entity.text.length,
      technique: "pseudonimizacao",
    });
  }

  return { masked, tokenMap, matches, techniques, ner_applied: true };
}
