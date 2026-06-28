/**
 * Registro/orquestrador de fontes oficiais para validação de citações.
 *
 * Projetado para alto volume de buscas concorrentes:
 *  - cache-first (cache global compartilhado entre tenants — uma lei é igual para todos)
 *  - dedup de chaves dentro da mesma requisição
 *  - concorrência limitada por requisição
 *  - rate limit + circuit breaker por fonte (protege APIs externas)
 *  - timeout e retry com backoff
 *  - log append-only de cada consulta (governança / prova de diligência)
 *
 * Invariante 3: o que não for confirmado em fonte oficial é "nao_verificavel".
 */

import { pool } from "@/lib/db";
import { datajudSourceLookup } from "@/lib/datajud-client";
import { lexmlLookup } from "@/lib/lexml-client";
import { sumulaLookup, isSumulaKey } from "@/lib/sumula-source";
import type { SourceLookupResult } from "@/lib/citation-validator";
import {
  TokenBucket,
  CircuitBreaker,
  withTimeout,
  withRetry,
  mapWithConcurrency,
} from "@/lib/concurrency";

const LOOKUP_TIMEOUT_MS = Number(process.env.SOURCE_LOOKUP_TIMEOUT_MS ?? 8000);
const MAX_CONCURRENCY = Number(process.env.SOURCE_MAX_CONCURRENCY ?? 8);
const NEGATIVE_TTL = Number(process.env.SOURCE_NEGATIVE_TTL_SECONDS ?? 21600); // 6h
const POSITIVE_TTL = Number(process.env.SOURCE_POSITIVE_TTL_SECONDS ?? 604800); // 7d

type Outcome = "hit" | "miss" | "error" | "cache_hit" | "circuit_open" | "rate_limited";

interface Connector {
  name: string;
  matches: (canonicalKey: string) => boolean;
  lookup: (canonicalKey: string, citeType: string, signal: AbortSignal) => Promise<SourceLookupResult | null>;
  bucket: TokenBucket;
  breaker: CircuitBreaker;
}

// Adaptadores para o formato comum SourceLookupResult
const datajudConnector: Connector = {
  name: "DATAJUD",
  matches: (k) => k.startsWith("cnj:"),
  lookup: (k, t) => datajudSourceLookup(k, t),
  bucket: new TokenBucket(20, 10), // 10 req/s, rajada de 20
  breaker: new CircuitBreaker(),
};

const lexmlConnector: Connector = {
  name: "LexML",
  matches: (k) => k.startsWith("br:"),
  lookup: async (k, _t, signal) => {
    const r = await lexmlLookup(k, signal);
    if (!r) return null;
    return {
      found: r.found,
      source: r.source,
      source_ref: r.source_ref,
      content: r.content,
      revoked: r.revoked,
    };
  },
  bucket: new TokenBucket(10, 5), // 5 req/s
  breaker: new CircuitBreaker(),
};

// Súmulas: consulta à base local (sem rede). Limites generosos pois é DB interno.
const sumulaConnector: Connector = {
  name: "Sumula",
  matches: (k) => isSumulaKey(k),
  lookup: (k) => sumulaLookup(k),
  bucket: new TokenBucket(1000, 1000),
  breaker: new CircuitBreaker(),
};

// Precedentes sem número CNJ (REsp/RE soltos) não têm fonte de lookup confiável
// hoje -> permanecem nao_verificavel honestamente (invariante 3).
const CONNECTORS: Connector[] = [datajudConnector, lexmlConnector, sumulaConnector];

function pickConnector(canonicalKey: string): Connector | null {
  return CONNECTORS.find((c) => c.matches(canonicalKey)) ?? null;
}

async function logLookup(
  orgId: string | null,
  canonicalKey: string,
  citeType: string,
  source: string,
  outcome: Outcome,
  latencyMs: number,
  httpStatus?: number
) {
  try {
    await pool.query(
      `INSERT INTO source_lookup_log (org_id, canonical_key, cite_type, source, outcome, http_status, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orgId, canonicalKey, citeType, source, outcome, httpStatus ?? null, latencyMs]
    );
  } catch {
    // Log de auditoria não pode derrubar a validação. Silencioso por design.
  }
}

async function readCache(canonicalKey: string): Promise<SourceLookupResult | null> {
  const cached = await pool.query(
    `SELECT payload, source, fetched_at, ttl_seconds FROM source_cache WHERE canonical_key = $1`,
    [canonicalKey]
  );
  if (cached.rows.length === 0) return null;
  const row = cached.rows[0];
  const age = (Date.now() - new Date(row.fetched_at).getTime()) / 1000;
  if (age >= row.ttl_seconds) return null;
  const p = row.payload as Omit<SourceLookupResult, "source"> & { source?: string };
  return {
    found: p.found,
    source: row.source ?? p.source ?? "cache",
    source_ref: p.source_ref,
    content: p.content,
    revoked: p.revoked,
  };
}

async function writeCache(canonicalKey: string, result: SourceLookupResult) {
  const ttl = result.found ? POSITIVE_TTL : NEGATIVE_TTL; // cacheia negativos também
  await pool.query(
    `INSERT INTO source_cache (canonical_key, payload, source, fetched_at, ttl_seconds)
     VALUES ($1, $2, $3, now(), $4)
     ON CONFLICT (canonical_key)
     DO UPDATE SET payload = $2, source = $3, fetched_at = now(), ttl_seconds = $4`,
    [
      canonicalKey,
      JSON.stringify({
        found: result.found,
        content: result.content,
        revoked: result.revoked,
        source_ref: result.source_ref,
        source: result.source,
      }),
      result.source,
      ttl,
    ]
  );
}

/**
 * Resolve uma única chave canônica contra a fonte apropriada,
 * com cache, rate limit, circuit breaker, timeout e auditoria.
 */
export async function lookupSource(
  canonicalKey: string,
  citeType: string,
  orgId: string | null = null
): Promise<SourceLookupResult | null> {
  // 1. Cache-first
  const cached = await readCache(canonicalKey);
  if (cached) {
    await logLookup(orgId, canonicalKey, citeType, cached.source, "cache_hit", 0);
    return cached;
  }

  const connector = pickConnector(canonicalKey);
  if (!connector) return null; // sem fonte para esse tipo -> nao_verificavel

  // 2. Circuit breaker
  if (connector.breaker.isOpen) {
    await logLookup(orgId, canonicalKey, citeType, connector.name, "circuit_open", 0);
    return null;
  }

  // 3. Rate limit
  await connector.bucket.acquire();

  const started = Date.now();
  const controller = new AbortController();
  try {
    const result = await withRetry(
      () =>
        withTimeout(
          connector.lookup(canonicalKey, citeType, controller.signal),
          LOOKUP_TIMEOUT_MS,
          `lookup ${connector.name}`
        ),
      { retries: 1, baseDelayMs: 300 }
    );

    connector.breaker.recordSuccess();
    const latency = Date.now() - started;

    if (result) {
      await writeCache(canonicalKey, result);
      await logLookup(orgId, canonicalKey, citeType, connector.name, result.found ? "hit" : "miss", latency);
    } else {
      await logLookup(orgId, canonicalKey, citeType, connector.name, "miss", latency);
    }
    return result;
  } catch {
    controller.abort();
    connector.breaker.recordFailure();
    await logLookup(orgId, canonicalKey, citeType, connector.name, "error", Date.now() - started);
    return null; // falha de fonte -> nao_verificavel (nunca afirma)
  }
}

/**
 * Resolve muitas chaves de uma vez: dedup + concorrência limitada.
 * Retorna um Map chave->resultado para reidratar a lista original.
 */
export async function lookupMany(
  keys: { canonicalKey: string; citeType: string }[],
  orgId: string | null = null
): Promise<Map<string, SourceLookupResult | null>> {
  const unique = new Map<string, string>(); // canonicalKey -> citeType
  for (const k of keys) {
    if (k.canonicalKey && !unique.has(k.canonicalKey)) {
      unique.set(k.canonicalKey, k.citeType);
    }
  }

  const entries = [...unique.entries()];
  const resolved = await mapWithConcurrency(
    entries,
    MAX_CONCURRENCY,
    async ([key, citeType]) => [key, await lookupSource(key, citeType, orgId)] as const
  );

  return new Map(resolved);
}
