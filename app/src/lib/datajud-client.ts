const DATAJUD_BASE = "https://api-publica.datajud.cnj.jus.br";

function getDatajudApiKey(): string {
  const key = process.env.DATAJUD_API_KEY;
  if (!key) {
    throw new Error(
      "DATAJUD_API_KEY não configurada. Defina a variável de ambiente antes de consultar o DATAJUD."
    );
  }
  return key;
}

const TRIBUNAL_ALIASES: Record<string, string> = {
  stj: "api_publica_stj",
  stf: "api_publica_stf", // STF não está no DATAJUD diretamente, mas tentamos
  tst: "api_publica_tst",
  trf1: "api_publica_trf1",
  trf2: "api_publica_trf2",
  trf3: "api_publica_trf3",
  trf4: "api_publica_trf4",
  trf5: "api_publica_trf5",
  trf6: "api_publica_trf6",
  tjpr: "api_publica_tjpr",
  tjsp: "api_publica_tjsp",
  tjrj: "api_publica_tjrj",
  tjmg: "api_publica_tjmg",
  tjsc: "api_publica_tjsc",
  tjrs: "api_publica_tjrs",
  tjba: "api_publica_tjba",
  tjpe: "api_publica_tjpe",
  tjce: "api_publica_tjce",
  tjdft: "api_publica_tjdft",
  tjgo: "api_publica_tjgo",
  tjpa: "api_publica_tjpa",
  tjam: "api_publica_tjam",
  tjma: "api_publica_tjma",
  tjes: "api_publica_tjes",
  tjpb: "api_publica_tjpb",
  tjrn: "api_publica_tjrn",
  tjpi: "api_publica_tjpi",
  tjse: "api_publica_tjse",
  tjal: "api_publica_tjal",
  tjmt: "api_publica_tjmt",
  tjms: "api_publica_tjms",
  tjro: "api_publica_tjro",
  tjac: "api_publica_tjac",
  tjap: "api_publica_tjap",
  tjrr: "api_publica_tjrr",
  tjto: "api_publica_tjto",
};

export interface DatajudHit {
  numeroProcesso: string;
  classe: { codigo: number; nome: string };
  tribunal: string;
  dataAjuizamento: string;
  dataHoraUltimaAtualizacao: string;
  grau: string;
  nivelSigilo: number;
  orgaoJulgador: { codigo: number; nome: string };
  assuntos: { codigo: number; nome: string }[];
  movimentos: {
    codigo: number;
    nome: string;
    dataHora: string;
    complementosTabelados?: { codigo: number; nome: string; descricao?: string }[];
  }[];
}

export interface DatajudSearchResult {
  found: boolean;
  total: number;
  hits: DatajudHit[];
  tribunal: string;
  error?: string;
}

function extractTribunalFromCnj(numeroProcesso: string): string | null {
  const clean = numeroProcesso.replace(/[.\-]/g, "");
  if (clean.length !== 20) return null;
  const justica = clean[13];
  const tribunalCode = clean.substring(14, 16);

  if (justica === "8") {
    const stateMap: Record<string, string> = {
      "01": "tjrj", "02": "tjrj", "03": "tjrj", "04": "tjrj",
      "05": "tjes", "06": "tjmg", "07": "tjmg", "08": "tjsp",
      "09": "tjpr", "10": "tjpr", "11": "tjpr", "12": "tjsc",
      "13": "tjrs", "14": "tjms", "15": "tjmt", "16": "tjgo",
      "17": "tjdft", "18": "tjba", "19": "tjse", "20": "tjal",
      "21": "tjpe", "22": "tjpb", "23": "tjrn", "24": "tjce",
      "25": "tjpi", "26": "tjma", "27": "tjpa", "28": "tjam",
    };
    return stateMap[tribunalCode] ?? null;
  }
  if (justica === "5") return `trt${parseInt(tribunalCode)}`;
  if (justica === "4") return `trf${parseInt(tribunalCode)}`;
  return null;
}

function resolveTribunalAlias(tribunal: string): string | null {
  const key = tribunal.toLowerCase().replace(/[^a-z0-9]/g, "");
  return TRIBUNAL_ALIASES[key] ?? null;
}

export async function searchDatajud(
  numeroProcesso: string,
  tribunalHint?: string
): Promise<DatajudSearchResult> {
  // Falha explícita (não "não encontrado") se a chave não estiver configurada —
  // o chamador deve tratar a exceção como nao_verificavel, nunca como ausência do registro.
  const apiKey = getDatajudApiKey();
  const clean = numeroProcesso.replace(/[.\-]/g, "");

  const tribunals: string[] = [];
  if (tribunalHint) {
    const alias = resolveTribunalAlias(tribunalHint);
    if (alias) tribunals.push(alias);
  }
  const fromCnj = extractTribunalFromCnj(clean);
  if (fromCnj) {
    const alias = resolveTribunalAlias(fromCnj);
    if (alias && !tribunals.includes(alias)) tribunals.push(alias);
  }
  if (tribunals.length === 0) {
    tribunals.push("api_publica_stj", "api_publica_tjsp", "api_publica_tjpr");
  }

  for (const alias of tribunals) {
    try {
      const res = await fetch(`${DATAJUD_BASE}/${alias}/_search`, {
        method: "POST",
        headers: {
          Authorization: `ApiKey ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: { match: { numeroProcesso: clean } },
          size: 5,
        }),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const hits = data.hits?.hits ?? [];

      if (hits.length > 0) {
        return {
          found: true,
          total: data.hits.total?.value ?? hits.length,
          hits: hits.map((h: { _source: DatajudHit }) => h._source),
          tribunal: alias,
        };
      }
    } catch {
      continue;
    }
  }

  return { found: false, total: 0, hits: [], tribunal: tribunals[0] };
}

export function datajudSourceLookup(
  canonicalKey: string,
  _citeType: string
): Promise<{
  found: boolean;
  source: string;
  source_ref: string | null;
  content: string | null;
  revoked: boolean;
} | null> {
  if (!canonicalKey.startsWith("cnj:")) return Promise.resolve(null);

  const numero = canonicalKey.replace("cnj:", "");
  return searchDatajud(numero).then((result) => {
    if (!result.found || result.hits.length === 0) {
      return {
        found: false,
        source: "DATAJUD/CNJ",
        source_ref: null,
        content: null,
        revoked: false,
      };
    }

    const hit = result.hits[0];
    const lastMove = hit.movimentos?.[0];

    const content = [
      `Classe: ${hit.classe.nome}`,
      `Tribunal: ${hit.tribunal}`,
      `Órgão julgador: ${hit.orgaoJulgador.nome}`,
      `Ajuizamento: ${hit.dataAjuizamento}`,
      `Assuntos: ${hit.assuntos.map((a) => a.nome).join(", ")}`,
      lastMove ? `Último movimento: ${lastMove.nome} (${lastMove.dataHora})` : null,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      found: true,
      source: "DATAJUD/CNJ",
      source_ref: `https://api-publica.datajud.cnj.jus.br/${result.tribunal}`,
      content,
      // O DATAJUD só confirma existência processual, não vigência de tese.
      // "Baixa" é movimentação processual (arquivamento), não superação de entendimento —
      // usá-la como proxy de "revogado" gerava falsos positivos/negativos de vigência.
      // O eixo de vigência real (tese superada em STF/STJ) ainda não está implementado.
      revoked: false,
    };
  });
}
