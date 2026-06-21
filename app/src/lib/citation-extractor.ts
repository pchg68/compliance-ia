export interface ExtractedCitation {
  raw_text: string;
  cite_type: "legislacao" | "sumula" | "precedente" | "tema";
  canonical_key: string | null;
  start: number;
  end: number;
}

interface CitationPattern {
  type: ExtractedCitation["cite_type"];
  regex: RegExp;
  normalize: (match: RegExpExecArray) => string | null;
}

function normalizeLegislacao(match: RegExpExecArray): string | null {
  const text = match[0].toLowerCase();
  const artMatch = text.match(/art\.?\s*(\d+)/);
  const leiMatch = text.match(/(?:lei|decreto|mp|lc|ec)\s*(?:n[.ºo°]?\s*)?(\d[\d.]*(?:\/\d{4})?)/i);
  if (leiMatch) {
    const num = leiMatch[1].replace(/\./g, "");
    const art = artMatch ? `!art${artMatch[1]}` : "";
    return `br:federal:lei:${num}${art}`;
  }
  if (artMatch) {
    const cfMatch = text.match(/\b(?:cf|constituição)\b/i);
    if (cfMatch) return `br:federal:cf:1988!art${artMatch[1]}`;
    const cpcMatch = text.match(/\bcpc\b/i);
    if (cpcMatch) return `br:federal:lei:13105/2015!art${artMatch[1]}`;
    const ccMatch = text.match(/\bcc\b/i);
    if (ccMatch) return `br:federal:lei:10406/2002!art${artMatch[1]}`;
    const cdcMatch = text.match(/\bcdc\b/i);
    if (cdcMatch) return `br:federal:lei:8078/1990!art${artMatch[1]}`;
  }
  return null;
}

function normalizePrecedente(match: RegExpExecArray): string | null {
  const text = match[0];
  const numMatch = text.match(/(\d[\d.]+)/);
  if (!numMatch) return null;
  const num = numMatch[1].replace(/\./g, "");
  const lower = text.toLowerCase();
  if (lower.includes("resp")) return `stj:resp:${num}`;
  if (lower.includes("re ") || lower.includes("re ")) return `stf:re:${num}`;
  if (lower.includes("hc")) return `stj:hc:${num}`;
  if (lower.includes("adi")) return `stf:adi:${num}`;
  if (lower.includes("adpf")) return `stf:adpf:${num}`;
  if (lower.includes("agrg") || lower.includes("agint")) return `stj:agint:${num}`;
  return null;
}

const PATTERNS: CitationPattern[] = [
  {
    type: "legislacao",
    regex: /\bart\.?\s*\d+[°ºo.]?(?:\s*,\s*(?:§\s*\d+[°ºo.]?|inciso\s+[IVXLCDM]+|alínea\s+[a-z]))*\s*(?:,?\s*(?:d[aoe]s?\s+)?(?:CF|CPC|CC|CDC|CLT|Constituição|Lei|Decreto|MP|LC|EC)\b(?:\s*(?:n[.ºo°]?\s*)?\d[\d.]*(?:\/\d{4})?)?)?/gi,
    normalize: normalizeLegislacao,
  },
  {
    type: "legislacao",
    regex: /\b(?:Lei|Decreto|MP|LC|EC)\s*(?:n[.ºo°]?\s*)?\d[\d.]*(?:\/\d{4})?(?:\s*,?\s*art\.?\s*\d+[°ºo.]?)?/gi,
    normalize: normalizeLegislacao,
  },
  {
    type: "sumula",
    regex: /\bSúmula\s*(?:Vinculante\s*)?\d+(?:\s*\/?\s*(?:STF|STJ))?/gi,
    normalize: (match) => {
      const text = match[0];
      const numMatch = text.match(/(\d+)/);
      if (!numMatch) return null;
      const vinculante = /vinculante/i.test(text);
      const tribunal = /stf/i.test(text) ? "stf" : /stj/i.test(text) ? "stj" : vinculante ? "stf" : "stj";
      return `${tribunal}:sumula${vinculante ? "_vinculante" : ""}:${numMatch[1]}`;
    },
  },
  {
    type: "precedente",
    regex: /\b(?:REsp|RE|HC|ADI|ADPF|AgRg|AgInt|RMS|RHC|AREsp)\s*(?:n[.ºo°]?\s*)?\d[\d.]+(?:\s*\/\s*[A-Z]{2})?/gi,
    normalize: normalizePrecedente,
  },
  {
    type: "precedente",
    regex: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g,
    normalize: (match) => `cnj:${match[0]}`,
  },
  {
    type: "tema",
    regex: /\bTema\s*(?:n[.ºo°]?\s*)?\d+(?:\s*\/?\s*(?:STF|STJ))?(?:\s*(?:RG|repetitivo))?/gi,
    normalize: (match) => {
      const text = match[0];
      const numMatch = text.match(/(\d+)/);
      if (!numMatch) return null;
      const tribunal = /stf/i.test(text) || /rg/i.test(text) ? "stf" : "stj";
      return `${tribunal}:tema:${numMatch[1]}`;
    },
  },
];

export function extractCitations(text: string): ExtractedCitation[] {
  const citations: ExtractedCitation[] = [];

  for (const pattern of PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(text)) !== null) {
      const overlaps = citations.some(
        (c) => match!.index >= c.start && match!.index < c.end
      );
      if (overlaps) continue;

      const canonical = pattern.normalize(match);

      citations.push({
        raw_text: match[0],
        cite_type: pattern.type,
        canonical_key: canonical,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  citations.sort((a, b) => a.start - b.start);
  return citations;
}
