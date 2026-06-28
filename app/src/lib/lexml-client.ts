/**
 * Conector de legislação federal via LexML (padrão SRU / CQL).
 * Endpoint oficial documentado; configurável por env. Invariante 3 do produto:
 * o que não for confirmado em fonte oficial é tratado como não-verificável —
 * este conector NUNCA fabrica conteúdo de norma.
 */

const LEXML_SRU = process.env.LEXML_SRU_URL ?? "https://www.lexml.gov.br/busca/SRU";

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
    return `urn:lex:br:${esfera}:constituicao:1988`;
  }

  const [numero, ano] = numRaw.split("/");
  if (!numero) return null;
  if (ano) {
    return `urn:lex:br:${esfera}:${tipoUrn}:${ano};${numero}`;
  }
  return `urn:lex:br:${esfera}:${tipoUrn}:${numero}`;
}

/** Extrai numberOfRecords do envelope SRU (parse mínimo e defensivo, sem dep de XML). */
function parseRecordCount(xml: string): number {
  const m = xml.match(/<(?:\w+:)?numberOfRecords>\s*(\d+)\s*<\/(?:\w+:)?numberOfRecords>/i);
  return m ? parseInt(m[1], 10) : 0;
}

/** Extrai um título/identificador legível do primeiro registro, se houver. */
function parseFirstTitle(xml: string): string | null {
  const m =
    xml.match(/<(?:dc:)?title>([^<]+)<\/(?:dc:)?title>/i) ??
    xml.match(/<(?:\w+:)?localidade>[^<]*<\/(?:\w+:)?localidade>/i);
  return m ? m[1]?.trim() ?? null : null;
}

export async function lexmlLookup(
  canonicalKey: string,
  signal?: AbortSignal
): Promise<LegislacaoLookup | null> {
  const urn = canonicalToUrn(canonicalKey);
  if (!urn) return null;

  // CQL: busca exata por URN no acervo
  const cql = `urn="${urn}"`;
  const url =
    `${LEXML_SRU}?operation=searchRetrieve&version=1.1` +
    `&query=${encodeURIComponent(cql)}&maximumRecords=1`;

  const res = await fetch(url, {
    headers: { Accept: "application/xml" },
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

  const xml = await res.text();
  const count = parseRecordCount(xml);

  if (count === 0) {
    return {
      found: false,
      source: "LexML",
      source_ref: `https://www.lexml.gov.br/urn/${urn}`,
      content: null,
      revoked: false,
      http_status: res.status,
    };
  }

  const title = parseFirstTitle(xml);
  return {
    found: true,
    source: "LexML",
    source_ref: `https://www.lexml.gov.br/urn/${urn}`,
    // Apenas metadados oficiais recuperados — nunca o texto inferido da norma.
    content: title ? `Norma localizada no acervo LexML: ${title}` : `Norma localizada no acervo LexML (URN ${urn}).`,
    revoked: false, // vigência detalhada exige consulta ao texto consolidado (fase futura)
    http_status: res.status,
  };
}
