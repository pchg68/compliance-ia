/**
 * Conector de legislação federal via LexML.
 * Usa o resolvedor de URN oficial (https://www.lexml.gov.br/urn/{urn}): uma URN
 * existente devolve a página da norma; uma inexistente devolve página curta com
 * o marcador "não encontrado". Verificado contra a API real em 2026-06.
 * Invariante 3: o que não for confirmado é não-verificável — nunca fabrica norma.
 */

const LEXML_URN_BASE = process.env.LEXML_URN_URL ?? "https://www.lexml.gov.br/urn";

export interface LegislacaoLookup {
  found: boolean;
  source: string;
  source_ref: string | null;
  content: string | null;
  revoked: boolean;
  http_status?: number;
}

/**
 * Converte a chave canônica do extractor para uma URN LexML.
 * Ex.: "br:federal:lei:13105/2015!art489" -> "urn:lex:br:federal:lei:2015;13105"
 * A vigência/artigo não entram na URN base (resolvidos no conteúdo).
 */
export function canonicalToUrn(canonicalKey: string): string | null {
  const base = canonicalKey.split("!")[0]; // remove sufixo de artigo
  const parts = base.split(":");
  // espera: br:federal:<tipo>:<numero>[/<ano>]
  if (parts.length < 4 || parts[0] !== "br") return null;

  const [, esfera, tipo, numRaw] = parts;
  const tipoMap: Record<string, string> = {
    lei: "lei",
    decreto: "decreto",
    lc: "lei.complementar",
    mp: "medida.provisoria",
    ec: "emenda.constitucional",
    cf: "constituicao",
  };
  const tipoUrn = tipoMap[tipo];
  if (!tipoUrn) return null;

  if (tipo === "cf") {
    // O resolvedor LexML exige o sufixo de identificação (;1988) para a CF/1988.
    return `urn:lex:br:${esfera}:constituicao:1988;1988`;
  }

  const [numero, ano] = numRaw.split("/");
  if (!numero) return null;
  if (ano) {
    return `urn:lex:br:${esfera}:${tipoUrn}:${ano};${numero}`;
  }
  return `urn:lex:br:${esfera}:${tipoUrn}:${numero}`;
}

/** Página de URN inexistente é curta e traz o marcador "não encontrado". */
export function isNotFoundPage(html: string): boolean {
  if (/n[aã]o\s+encontrad/i.test(html)) return true;
  // Heurística de tamanho: páginas de norma real são grandes (>5KB);
  // as de erro ficam na casa de ~1KB.
  if (html.length < 2000) return true;
  return false;
}

/** Extrai o título legível da página da norma, se presente. */
function parseTitle(html: string): string | null {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return null;
  // remove sufixo do portal ("- LexML" etc.)
  return m[1].replace(/\s*[-–|]\s*LexML.*$/i, "").trim() || null;
}

export async function lexmlLookup(
  canonicalKey: string,
  signal?: AbortSignal
): Promise<LegislacaoLookup | null> {
  const urn = canonicalToUrn(canonicalKey);
  if (!urn) return null;

  const url = `${LEXML_URN_BASE}/${urn}`;
  const res = await fetch(url, {
    headers: { Accept: "text/html" },
    signal,
  });

  if (!res.ok) {
    return {
      found: false,
      source: "LexML",
      source_ref: url,
      content: null,
      revoked: false,
      http_status: res.status,
    };
  }

  const html = await res.text();

  if (isNotFoundPage(html)) {
    return {
      found: false,
      source: "LexML",
      source_ref: url,
      content: null,
      revoked: false,
      http_status: res.status,
    };
  }

  const title = parseTitle(html);
  return {
    found: true,
    source: "LexML",
    source_ref: url,
    // Apenas metadados oficiais recuperados — nunca o texto inferido da norma.
    content: title
      ? `Norma localizada no acervo LexML: ${title}`
      : `Norma localizada no acervo LexML (URN ${urn}).`,
    revoked: false, // vigência detalhada exige o texto consolidado (fase futura)
    http_status: res.status,
  };
}
