export interface PiiMatch {
  type: string;
  original: string;
  placeholder: string;
  start: number;
  end: number;
  technique: "pseudonimizacao";
}

export interface MaskResult {
  masked: string;
  tokenMap: Record<string, string>;
  matches: PiiMatch[];
  techniques: Record<string, string>;
}

interface PatternDef {
  type: string;
  regex: RegExp;
  validate?: (match: string) => boolean;
}

function validateCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (check !== parseInt(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === parseInt(digits[10]);
}

function validateCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
  let check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (check !== parseInt(digits[12])) return false;

  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
  check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return check === parseInt(digits[13]);
}

const PATTERNS: PatternDef[] = [
  {
    type: "CPF",
    regex: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    validate: validateCpf,
  },
  {
    type: "CNPJ",
    regex: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
    validate: validateCnpj,
  },
  {
    type: "EMAIL",
    regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  },
  {
    type: "TELEFONE",
    regex: /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}\b/g,
  },
  {
    type: "CEP",
    regex: /\b\d{5}-?\d{3}\b/g,
  },
  {
    type: "OAB",
    regex: /\bOAB[\/\s]*[A-Z]{2}[\/\s]*\d{3,6}\b/gi,
  },
  {
    type: "PROCESSO_CNJ",
    regex: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g,
  },
  {
    type: "RG",
    regex: /\b\d{1,2}\.?\d{3}\.?\d{3}-?[0-9Xx]\b/g,
  },
];

export function maskPii(text: string): MaskResult {
  const matches: PiiMatch[] = [];
  const counters: Record<string, number> = {};

  for (const pattern of PATTERNS) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

    while ((match = regex.exec(text)) !== null) {
      const original = match[0];

      if (pattern.validate && !pattern.validate(original)) continue;

      const existing = matches.find(
        (m) => m.start === match!.index || (match!.index >= m.start && match!.index < m.end)
      );
      if (existing) continue;

      counters[pattern.type] = (counters[pattern.type] ?? 0) + 1;
      const placeholder = `[${pattern.type}_${counters[pattern.type]}]`;

      matches.push({
        type: pattern.type,
        original,
        placeholder,
        start: match.index,
        end: match.index + original.length,
        technique: "pseudonimizacao",
      });
    }
  }

  matches.sort((a, b) => b.start - a.start);

  let masked = text;
  const tokenMap: Record<string, string> = {};
  const techniques: Record<string, string> = {};

  for (const m of matches) {
    masked = masked.slice(0, m.start) + m.placeholder + masked.slice(m.end);
    tokenMap[m.placeholder] = m.original;
    techniques[m.placeholder] = m.technique;
  }

  return { masked, tokenMap, matches: matches.reverse(), techniques };
}

export function unmaskPii(masked: string, tokenMap: Record<string, string>): string {
  let result = masked;
  for (const [placeholder, original] of Object.entries(tokenMap)) {
    result = result.replaceAll(placeholder, original);
  }
  return result;
}
