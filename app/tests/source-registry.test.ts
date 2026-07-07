import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// source-registry.ts grava cache/log via `pool` — mockado para não exigir banco real.
// Este teste é sobre o invariante 3 (fonte indisponível -> nao_verificavel), não sobre
// persistência; ver hash-chain.test.ts/audit-trail-immutability.test.ts para os testes
// que exigem Postgres de verdade.
vi.mock("@/lib/db", () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

describe("source-registry — fonte indisponível vira nao_verificavel, nunca uma afirmação", () => {
  const originalFetch = global.fetch;
  const originalDatajudKey = process.env.DATAJUD_API_KEY;

  beforeEach(() => {
    process.env.DATAJUD_API_KEY = "chave-de-teste";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.DATAJUD_API_KEY = originalDatajudKey;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("DATAJUD: todos os tribunais falhando por erro de rede -> lookupSource devolve null", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;

    const { lookupSource } = await import("@/lib/source-registry");
    const result = await lookupSource("cnj:00008323520184013202", "precedente", null);

    expect(result).toBeNull();
  });

  it("DATAJUD: timeout em todos os tribunais -> lookupSource devolve null (não 'não localizada')", async () => {
    global.fetch = vi.fn(
      () => new Promise(() => {}) // nunca resolve -> força o withTimeout interno a estourar
    ) as unknown as typeof fetch;

    vi.stubEnv("SOURCE_LOOKUP_TIMEOUT_MS", "50");
    const { lookupSource } = await import("@/lib/source-registry");
    const result = await lookupSource("cnj:00008323520184013202", "precedente", null);

    expect(result).toBeNull();
  }, 10_000);

  it("LexML: erro de rede -> lookupSource devolve null", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error")) as unknown as typeof fetch;

    const { lookupSource } = await import("@/lib/source-registry");
    const result = await lookupSource("br:federal:lei:13105/2015", "legislacao", null);

    expect(result).toBeNull();
  });

  it("DATAJUD: pelo menos um tribunal responde 200 sem resultados -> 'não localizada' de verdade (found: false), não null", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ hits: { total: { value: 0 }, hits: [] } }),
    }) as unknown as typeof fetch;

    const { lookupSource } = await import("@/lib/source-registry");
    const result = await lookupSource("cnj:00008323520184013202", "precedente", null);

    expect(result).not.toBeNull();
    expect(result?.found).toBe(false);
  });
});
